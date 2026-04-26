'use client';

/**
 * Solana FBiTStaking Anchor contract service
 *
 * Stake entry PDA is seeded with [b"stake", owner_pubkey, stakedAt_le_bytes].
 * The `stakedAt` timestamp stored in StakeEntry is the PDA seed, which lets
 * the client re-derive the correct PDA for claim / compound / unstake.
 *
 * All public methods throw on error — callers should catch.
 * Amount parameters are in token units (not lamports).
 */

import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { IDL } from './idl';
import { NETWORK_CONFIG } from '@/lib/config';
import type { PlatformStats, StakeEntry, UserAccount, ReferralInfo } from '@/types';

function getProgramId(): PublicKey {
  const addr = NETWORK_CONFIG.solana.contractAddress;
  if (!addr) throw new Error('Solana program ID not configured. Set NEXT_PUBLIC_SOLANA_PROGRAM_ID in your .env.local');
  return new PublicKey(addr);
}
const DECIMALS   = 6;
const SCALE      = 10 ** DECIMALS;

function toLamports(amount: number): BN {
  return new BN(Math.floor(amount * SCALE));
}
function fromLamports(n: BN | number): number {
  return (typeof n === 'number' ? n : n.toNumber()) / SCALE;
}

// ── PDA derivations ────────────────────────────────────────────────────────────

function platformPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('platform')], getProgramId());
}

function userPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('user'), owner.toBuffer()], getProgramId());
}

function stakeEntryPda(owner: PublicKey, stakedAt: number): [PublicKey, number] {
  const ts = new BN(stakedAt);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stake'), owner.toBuffer(), ts.toArrayLike(Buffer, 'le', 8)],
    getProgramId()
  );
}

// ── Provider / Program helpers ─────────────────────────────────────────────────

/**
 * Returns whichever Solana wallet is currently connected.
 * Checks Phantom, Solflare, Backpack, and Jupiter in order.
 */
function getSolanaWallet(): any {
  const w = (window as any);
  const candidates = [w.solana, w.solflare, w.backpack, w.jupiter];
  const wallet = candidates.find(c => c?.isConnected && c?.publicKey);
  if (!wallet?.publicKey) throw new Error('Solana wallet not connected.');
  return wallet;
}

function getProvider(): AnchorProvider {
  const wallet = getSolanaWallet();
  const connection = new Connection(NETWORK_CONFIG.solana.rpcUrl, 'confirmed');
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

function getProgram(): Program {
  return new (Program as any)(IDL as any, getProgramId(), getProvider()) as Program;
}

function getOwner(): PublicKey {
  const wallet = getSolanaWallet();
  return new PublicKey(wallet.publicKey.toString());
}

/**
 * Stake vault = ATA( stakeMint, platformPDA ).
 * If NEXT_PUBLIC_SOLANA_STAKE_VAULT is set in env it takes priority (custom vaults).
 * Otherwise the address is derived automatically — no env var required.
 */
function getStakeVault(): PublicKey {
  const envAddr = NETWORK_CONFIG.solana.stakeVaultAddress;
  if (envAddr && envAddr.length > 10 && !envAddr.toUpperCase().startsWith('YOUR_')) {
    return new PublicKey(envAddr);
  }
  const [platPda] = platformPda();
  const stakeMint = new PublicKey(NETWORK_CONFIG.solana.stakeTokenAddress);
  return ata(stakeMint, platPda);
}

/**
 * Reward vault = ATA( rewardMint, platformPDA ).
 * If NEXT_PUBLIC_SOLANA_REWARD_VAULT is set in env it takes priority.
 * Otherwise derived automatically.
 */
function getRewardVault(): PublicKey {
  const envAddr = NETWORK_CONFIG.solana.rewardVaultAddress;
  if (envAddr && envAddr.length > 10 && !envAddr.toUpperCase().startsWith('YOUR_')) {
    return new PublicKey(envAddr);
  }
  const [platPda] = platformPda();
  const rewardMint = new PublicKey(NETWORK_CONFIG.solana.rewardTokenAddress);
  return ata(rewardMint, platPda);
}

/** Derive the ATA for `owner` and `mint` — works synchronously via Anchor utils */
function ata(mint: PublicKey, owner: PublicKey): PublicKey {
  const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bse');
  const SPL_TOKEN_PROGRAM = TOKEN_PROGRAM_ID;
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM
  );
  return address;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function solanaFetchPlatformStats(): Promise<PlatformStats | null> {
  try {
    const program = getProgram();
    const [pda] = platformPda();
    const platform: any = await (program.account as any).platform.fetch(pda);
    const totalStaked    = fromLamports(platform.totalStaked);
    const annualEmission = fromLamports(platform.annualEmission);
    const burnBps        = platform.burnBps ? Number(platform.burnBps) : 1000;

    // Mirror contract clamping: 6000 (60%) – 50000 (500%)
    let effectiveAPY = 6_000;
    if (totalStaked > 0 && annualEmission > 0) {
      const raw = Math.round((annualEmission / totalStaked) * 10_000);
      effectiveAPY = Math.min(50_000, Math.max(6_000, raw));
    }

    const totalReserve          = platform.totalReserve          ? fromLamports(platform.totalReserve)          : 0;
    const totalEmissionReleased = platform.totalEmissionReleased ? fromLamports(platform.totalEmissionReleased) : 0;
    const emissionStartTime     = platform.emissionStartTime     ? Number(platform.emissionStartTime)           : 0;
    const totalYearlyBurned     = platform.totalYearlyBurned     ? fromLamports(platform.totalYearlyBurned)     : 0;
    const lastYearBurnTime      = platform.lastYearBurnTime      ? Number(platform.lastYearBurnTime)            : 0;

    const originalDeposit = totalReserve + totalEmissionReleased;
    const effectiveMax    = originalDeposit > totalYearlyBurned ? originalDeposit - totalYearlyBurned : 0;

    // Calculate releasable emission client-side (mirrors contract logic)
    let releasableEmission = 0;
    if (emissionStartTime > 0 && totalReserve > 0 && annualEmission > 0) {
      const elapsed  = Date.now() / 1000 - emissionStartTime;
      const totalDue = Math.min((annualEmission * elapsed) / (365 * 86400), effectiveMax);
      releasableEmission = Math.max(0, Math.min(totalDue - totalEmissionReleased, totalReserve));
    }

    const remainingYears = annualEmission > 0 && effectiveMax > totalEmissionReleased
      ? Math.floor((effectiveMax - totalEmissionReleased) / annualEmission)
      : 0;

    // Conservative upper-bound of rewards currently owed to all active stakers (mirrors contract)
    const CLAIM_INTERVAL_S = 43200; // 12 hours
    let maxPendingRewards = 0;
    if (totalStaked > 0 && (lastYearBurnTime > 0 || emissionStartTime > 0)) {
      const refTime = lastYearBurnTime > 0 ? lastYearBurnTime : emissionStartTime;
      const nowSec  = Date.now() / 1000;
      const elapsed = nowSec - refTime;
      if (elapsed > 0) {
        const maxIntervals = Math.min(Math.floor(elapsed / CLAIM_INTERVAL_S), 730);
        if (maxIntervals > 0) {
          maxPendingRewards = (totalStaked * effectiveAPY * maxIntervals) / (730 * 10000);
        }
      }
    }

    return {
      totalStaked,
      totalUsers: platform.totalUsers.toNumber(),
      rewardPoolBalance: fromLamports(platform.rewardPoolBalance),
      rewardRate: platform.rewardRate.toNumber(),
      referralRewardRate: platform.referralRewardRate.toNumber(),
      isPaused: platform.isPaused,
      totalBurned: fromLamports(platform.totalBurned),
      annualEmission,
      burnBps,
      effectiveAPY,
      isRenounced: Boolean(platform.isRenounced),
      feeRecipient: platform.feeRecipient?.toString() ?? '',
      totalFeesCollected: fromLamports(platform.totalFeesCollected),
      totalReserve,
      emissionStartTime,
      totalEmissionReleased,
      releasableEmission,
      totalYearlyBurned,
      lastYearBurnTime,
      remainingYears,
      maxPendingRewards,
    };
  } catch {
    return null;
  }
}

export async function solanaIsRegistered(owner: PublicKey): Promise<boolean> {
  try {
    const program = getProgram();
    const [pda] = userPda(owner);
    await (program.account as any).userAccount.fetch(pda);
    return true;
  } catch {
    return false;
  }
}

export async function solanaRegisterUser(referrer?: string): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const [userAccPda] = userPda(owner);

  let referrerPubkey: PublicKey | null = null;
  let referrerAccPda = userAccPda; // fallback (skipped when referrer == None)

  if (referrer) {
    try {
      referrerPubkey = new PublicKey(referrer);
      [referrerAccPda] = userPda(referrerPubkey);
    } catch {}
  }

  const tx = await (program.methods as any)
    .registerUser(referrerPubkey)
    .accounts({
      platform:       platPda,
      userAccount:    userAccPda,
      referrerAccount: referrerAccPda,
      owner,
      systemProgram:  SystemProgram.programId,
    })
    .rpc();

  return { txHash: tx };
}

export async function solanaStake(
  amount: number,
  referrer?: string
): Promise<{ txHash: string; stakedAt: number }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const [userAccPda] = userPda(owner);

  // Auto-register
  const registered = await solanaIsRegistered(owner);
  if (!registered) {
    await solanaRegisterUser(referrer);
  }

  const stakedAt = Math.floor(Date.now() / 1000);
  const [stakeEntryAccPda] = stakeEntryPda(owner, stakedAt);

  const stakeMint   = new PublicKey(NETWORK_CONFIG.solana.stakeTokenAddress);
  const rewardMint  = new PublicKey(NETWORK_CONFIG.solana.rewardTokenAddress);
  const userTokenAcc = ata(stakeMint, owner);
  const stakeVault   = getStakeVault();
  const rewardVault  = getRewardVault();

  // Resolve admin stake account (authority's stake-mint ATA)
  let adminStakeAccount = userTokenAcc; // fallback (unused when renounced)
  try {
    const platform: any = await (program.account as any).platform.fetch(platPda);
    if (!platform.isRenounced && platform.authority) {
      const authorityKey = new PublicKey(platform.authority.toString());
      adminStakeAccount = ata(stakeMint, authorityKey);
    }
  } catch {}

  // Build remaining_accounts: walk the referral chain up to 10 levels.
  // Each level contributes 2 accounts: [UserAccount PDA (writable), reward ATA (writable)].
  const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
  try {
    // The staker's own account already has referrer stored on-chain (set during registerUser).
    const userAccData: any = await (program.account as any).userAccount.fetch(userAccPda);
    let currentReferrerKey: PublicKey | null = userAccData.referrer
      ? new PublicKey(userAccData.referrer.toString())
      : null;

    for (let lvl = 0; lvl < 10 && currentReferrerKey !== null; lvl++) {
      const [referrerUserPda] = userPda(currentReferrerKey);
      const referrerRewardAta = ata(rewardMint, currentReferrerKey);

      remainingAccounts.push(
        { pubkey: referrerUserPda, isSigner: false, isWritable: true },
        { pubkey: referrerRewardAta, isSigner: false, isWritable: true },
      );

      // Fetch next ancestor's key (for the next loop iteration)
      try {
        const refData: any = await (program.account as any).userAccount.fetch(referrerUserPda);
        currentReferrerKey = refData.referrer
          ? new PublicKey(refData.referrer.toString())
          : null;
      } catch {
        break; // ancestor account not found — chain ends here
      }
    }
  } catch {
    // Chain fetch failed — proceed without referral rewards (safe degradation)
  }

  const tx = await (program.methods as any)
    .stake(toLamports(amount), 0)
    .accounts({
      platform:         platPda,
      userAccount:      userAccPda,
      stakeEntry:       stakeEntryAccPda,
      userTokenAccount: userTokenAcc,
      stakeVault,
      adminStakeAccount,
      rewardVault,
      owner,
      tokenProgram:     TOKEN_PROGRAM_ID,
      systemProgram:    SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .rpc();

  // Verify the actual on-chain stakedAt so future PDA derivations (claim/unstake)
  // use the block timestamp the contract recorded, not the client-side estimate.
  let actualStakedAt = stakedAt;
  try {
    const entry: any = await (program.account as any).stakeEntry.fetch(stakeEntryAccPda);
    actualStakedAt = entry.stakedAt.toNumber();
  } catch {
    // If fetch fails (e.g. slight clock drift created a different PDA), fall back
    // to client timestamp — the user will need to retry or re-stake.
  }

  return { txHash: tx, stakedAt: actualStakedAt };
}

export async function solanaClaimRewards(
  _stakeId: number | string,
  stakedAt: number
): Promise<{ txHash: string; reward: number }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const [userAccPda] = userPda(owner);
  const [stakeEntryAccPda] = stakeEntryPda(owner, stakedAt);

  // Read pending reward before claiming
  let reward = 0;
  try {
    const entry: any = await (program.account as any).stakeEntry.fetch(stakeEntryAccPda);
    const now = Math.floor(Date.now() / 1000);
    // Match contract: reward accrues per completed 12h interval
    const intervals = Math.floor((now - entry.lastClaimAt.toNumber()) / 43200);
    reward = fromLamports(entry.amount) * entry.apy.toNumber() * intervals / (730 * 10_000);
  } catch {}

  const rewardMint = new PublicKey(NETWORK_CONFIG.solana.rewardTokenAddress);
  const userTokenAcc = ata(rewardMint, owner);
  const rewardVault  = getRewardVault();

  // Fetch platform to check renounced state and get fee_recipient
  const [pda] = platformPda();
  let adminRewardAccount = userTokenAcc; // fallback: pass user's ATA (unused when renounced)
  let feeRecipientTokenAccount = userTokenAcc; // fallback (unused when NOT renounced)
  try {
    const platform: any = await (program.account as any).platform.fetch(pda);
    if (platform.isRenounced && platform.feeRecipient) {
      const feeRecipientKey = new PublicKey(platform.feeRecipient.toString());
      feeRecipientTokenAccount = ata(rewardMint, feeRecipientKey);
      adminRewardAccount       = feeRecipientTokenAccount; // pass something valid for the constraint
    } else {
      const authorityKey = new PublicKey(platform.authority.toString());
      adminRewardAccount = ata(rewardMint, authorityKey);
    }
  } catch {}

  // IDL requires stakeEntryId (u64) = the stakedAt timestamp used as PDA seed
  const tx = await (program.methods as any)
    .claimRewards(new BN(stakedAt))
    .accounts({
      platform:                   platPda,
      userAccount:                userAccPda,
      stakeEntry:                 stakeEntryAccPda,
      userTokenAccount:           userTokenAcc,
      rewardVault,
      adminRewardAccount,
      rewardTokenMint:            rewardMint,
      feeRecipientTokenAccount,
      owner,
      tokenProgram:               TOKEN_PROGRAM_ID,
    })
    .rpc();

  return { txHash: tx, reward };
}

export async function solanaCompoundRewards(
  _stakeId: number | string,
  stakedAt: number
): Promise<{ txHash: string; reward: number }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const [userAccPda] = userPda(owner);
  const [stakeEntryAccPda] = stakeEntryPda(owner, stakedAt);

  let reward = 0;
  try {
    const entry: any = await (program.account as any).stakeEntry.fetch(stakeEntryAccPda);
    const now = Math.floor(Date.now() / 1000);
    // Match contract: reward accrues per completed 12h interval
    const intervals = Math.floor((now - entry.lastClaimAt.toNumber()) / 43200);
    reward = fromLamports(entry.amount) * entry.apy.toNumber() * intervals / (730 * 10_000);
  } catch {}

  const rewardMint  = new PublicKey(NETWORK_CONFIG.solana.rewardTokenAddress);
  const rewardVault = getRewardVault();

  // Resolve admin/fee-recipient accounts based on renounce state
  const [pda] = platformPda();
  let adminRewardAccount        = ata(rewardMint, owner); // fallback
  let feeRecipientTokenAccount  = ata(rewardMint, owner); // fallback
  try {
    const platform: any = await (program.account as any).platform.fetch(pda);
    if (platform.isRenounced && platform.feeRecipient) {
      const feeRecipientKey = new PublicKey(platform.feeRecipient.toString());
      feeRecipientTokenAccount = ata(rewardMint, feeRecipientKey);
      adminRewardAccount       = feeRecipientTokenAccount;
    } else {
      const authorityKey = new PublicKey(platform.authority.toString());
      adminRewardAccount = ata(rewardMint, authorityKey);
    }
  } catch {}

  const tx = await (program.methods as any)
    .compoundRewards()
    .accounts({
      platform:                  platPda,
      userAccount:               userAccPda,
      stakeEntry:                stakeEntryAccPda,
      rewardVault,
      adminRewardAccount,
      rewardTokenMint:           rewardMint,
      feeRecipientTokenAccount,
      owner,
      tokenProgram:              TOKEN_PROGRAM_ID,
    })
    .rpc();

  return { txHash: tx, reward };
}

export async function solanaUnstake(stakedAt: number): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const [userAccPda] = userPda(owner);
  const [stakeEntryAccPda] = stakeEntryPda(owner, stakedAt);

  const stakeMint = new PublicKey(NETWORK_CONFIG.solana.stakeTokenAddress);
  const userTokenAcc = ata(stakeMint, owner);
  const stakeVault   = getStakeVault();

  const tx = await (program.methods as any)
    .unstake()
    .accounts({
      platform:         platPda,
      userAccount:      userAccPda,
      stakeEntry:       stakeEntryAccPda,
      userTokenAccount: userTokenAcc,
      stakeVault,
      owner,
      tokenProgram:     TOKEN_PROGRAM_ID,
    })
    .rpc();

  return { txHash: tx };
}

// ── Admin ──────────────────────────────────────────────────────────────────────

export async function solanaFundRewardPool(amount: number): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();

  const rewardMint   = new PublicKey(NETWORK_CONFIG.solana.rewardTokenAddress);
  const funderTokenAcc = ata(rewardMint, owner);
  const rewardVault  = getRewardVault();

  const tx = await (program.methods as any)
    .fundRewardPool(toLamports(amount))
    .accounts({
      platform:           platPda,
      authority:          owner,
      funderTokenAccount: funderTokenAcc,
      rewardVault,
      tokenProgram:       TOKEN_PROGRAM_ID,
    })
    .rpc();

  return { txHash: tx };
}

export async function solanaDepositReserve(amount: number): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const rewardMint     = new PublicKey(NETWORK_CONFIG.solana.rewardTokenAddress);
  const funderTokenAcc = ata(rewardMint, owner);
  const rewardVault    = getRewardVault();
  const tx = await (program.methods as any)
    .depositReserve(toLamports(amount))
    .accounts({
      platform: platPda, authority: owner,
      funderTokenAccount: funderTokenAcc, rewardVault, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  return { txHash: tx };
}

export async function solanaReleaseEmission(): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const tx = await (program.methods as any)
    .releaseEmission()
    .accounts({ platform: platPda, caller: owner })
    .rpc();
  return { txHash: tx };
}

export async function solanaBurnUnusedPool(amount: number): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const rewardVault = getRewardVault();
  const tx = await (program.methods as any)
    .burnUnusedPool(toLamports(amount))
    .accounts({ platform: platPda, authority: owner, rewardVault, deadAddress: new PublicKey('1nc1nerator11111111111111111111111111111111'), tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  return { txHash: tx };
}

export async function solanaSetRewardRate(rate: number): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const tx = await (program.methods as any).setRewardRate(new BN(rate))
    .accounts({ platform: platPda, authority: owner }).rpc();
  return { txHash: tx };
}

export async function solanaSetReferralRewardRate(rate: number): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const tx = await (program.methods as any).setReferralRewardRate(new BN(rate))
    .accounts({ platform: platPda, authority: owner }).rpc();
  return { txHash: tx };
}

export async function solanaBlockUser(userAddress: string): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const targetKey = new PublicKey(userAddress);
  const [targetPda] = userPda(targetKey);
  const tx = await (program.methods as any).blockUser()
    .accounts({ platform: platPda, userAccount: targetPda, authority: owner }).rpc();
  return { txHash: tx };
}

export async function solanaUnblockUser(userAddress: string): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const targetKey = new PublicKey(userAddress);
  const [targetPda] = userPda(targetKey);
  const tx = await (program.methods as any).unblockUser()
    .accounts({ platform: platPda, userAccount: targetPda, authority: owner }).rpc();
  return { txHash: tx };
}

export async function solanaTogglePause(): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const tx = await (program.methods as any).togglePause()
    .accounts({ platform: platPda, authority: owner }).rpc();
  return { txHash: tx };
}

export async function solanaSetAnnualEmission(annualEmission: number): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const tx = await (program.methods as any)
    .setAnnualEmission(toLamports(annualEmission))
    .accounts({ platform: platPda, authority: owner })
    .rpc();
  return { txHash: tx };
}

export async function solanaSetBurnBps(burnBps: number): Promise<{ txHash: string }> {
  const program  = getProgram();
  const owner    = getOwner();
  const [platPda] = platformPda();
  const tx = await (program.methods as any)
    .setBurnBps(new BN(burnBps))
    .accounts({ platform: platPda, authority: owner })
    .rpc();
  return { txHash: tx };
}

/**
 * Update a Team Target Bonus tier.
 * @param index          Tier index 0–9
 * @param minTeamStaked  Minimum team total staked in token units (not lamports)
 * @param bonusBps       Bonus in basis points (max 1000 = 10 %)
 */
export async function solanaSetTeamTargetTier(
  index: number,
  minTeamStaked: number,
  bonusBps: number
): Promise<{ txHash: string }> {
  const program   = getProgram();
  const owner     = getOwner();
  const [platPda] = platformPda();
  const tx = await (program.methods as any)
    .setTeamTargetTier(index, toLamports(minTeamStaked), new BN(bonusBps))
    .accounts({ platform: platPda, authority: owner })
    .rpc();
  return { txHash: tx };
}

/**
 * Permanently renounce ownership. Only callable by current authority.
 * After this call, all admin functions are locked and a 25% passive fee
 * is paid to the former owner on every claim/compound.
 */
export async function solanaRenounceOwnership(): Promise<{ txHash: string }> {
  const program   = getProgram();
  const authority = getOwner();
  const [platPda] = platformPda();
  const tx = await (program.methods as any)
    .renounceOwnership()
    .accounts({ platform: platPda, authority })
    .rpc();
  return { txHash: tx };
}


// ── Read-only helpers ──────────────────────────────────────────────────────────

/** Returns a read-only Anchor program instance (no wallet signer required). */
function getReadOnlyProgram(): Program {
  const connection = new Connection(NETWORK_CONFIG.solana.rpcUrl, 'confirmed');
  // Anchor requires a wallet shape but read ops don't sign anything
  const noopWallet = {
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, noopWallet as any, { commitment: 'confirmed' });
  return new (Program as any)(IDL as any, getProgramId(), provider) as Program;
}

/**
 * Fetch all active StakeEntry accounts for a given owner.
 * Uses a memcmp filter on the owner field (offset 8, after discriminator).
 */
export async function solanaGetUserStakes(ownerAddress: string): Promise<StakeEntry[]> {
  try {
    const owner = new PublicKey(ownerAddress);
    const program = getReadOnlyProgram();
    const all = await (program.account as any).stakeEntry.all([
      { memcmp: { offset: 8, bytes: owner.toBase58() } },
    ]);
    return (all as any[])
      .filter((e: any) => e.account.isActive)
      .map((e: any): StakeEntry => {
        const stakedAt = e.account.stakedAt.toNumber();
        return {
          id: stakedAt,  // use stakedAt as unique ID for Solana stakes
          amount:          fromLamports(e.account.amount),
          lockPeriodIndex: e.account.lockPeriodIndex,
          stakedAt,
          unlockAt:        e.account.unlockAt.toNumber(),
          lastClaimAt:     e.account.lastClaimAt.toNumber(),
          totalClaimed:    fromLamports(e.account.totalClaimed),
          isActive:        e.account.isActive,
          apy:             e.account.apy.toNumber(),
        };
      });
  } catch {
    return [];
  }
}

// Ordered list of Solana RPC endpoints tried in sequence for balance reads.
// Uses the configured URL first, then falls back to known-good public nodes.
const SOLANA_RPC_FALLBACKS = [
  NETWORK_CONFIG.solana.rpcUrl,
  'https://api.mainnet-beta.solana.com',
].filter(Boolean);

/**
 * Fetch the FBiT SPL token balance for a wallet address.
 * Tries each RPC in SOLANA_RPC_FALLBACKS until one succeeds.
 * Returns 0 if the wallet has no token account for this mint.
 */
export async function solanaGetTokenBalance(ownerAddress: string): Promise<number> {
  const owner = new PublicKey(ownerAddress);
  const stakeMint = new PublicKey(NETWORK_CONFIG.solana.stakeTokenAddress);

  for (const rpc of SOLANA_RPC_FALLBACKS) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: stakeMint });
      if (accounts.value.length === 0) return 0;
      return accounts.value.reduce((sum, acct) => {
        const amount: number = acct.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
        return sum + amount;
      }, 0);
    } catch {
      // Try next RPC
    }
  }
  return 0;
}

export async function solanaGetUserAccount(ownerAddress: string): Promise<UserAccount | null> {
  try {
    const program = getProgram();
    const owner = new PublicKey(ownerAddress);
    const [pda] = userPda(owner);
    const acc = await (program.account as any).userAccount.fetch(pda);
    return {
      address:              ownerAddress,
      totalStaked:          fromLamports(acc.totalStaked),
      totalRewardsEarned:   fromLamports(acc.totalRewardsEarned),
      totalReferralRewards: fromLamports(acc.totalReferralRewards),
      referrer:             acc.referrer ? acc.referrer.toBase58() : null,
      referralCount:        acc.referralCount.toNumber(),
      teamSize:             0,
      teamTotalStaked:      0,
      isBlocked:            acc.isBlocked,
      registeredAt:         acc.registeredAt.toNumber(),
    };
  } catch {
    return null;
  }
}

export async function solanaGetReferralInfo(ownerAddress: string): Promise<ReferralInfo | null> {
  try {
    const program = getProgram();
    const owner = new PublicKey(ownerAddress);
    const [pda] = userPda(owner);
    const acc = await (program.account as any).userAccount.fetch(pda);
    return {
      totalReferrals:       acc.referralCount.toNumber(),
      totalReferralRewards: fromLamports(acc.totalReferralRewards),
      referralLink:         '',
      referrals:            [],
      chain:                [],
    };
  } catch {
    return null;
  }
}

/**
 * Admin / crank: update a user's team_size and team_total_staked on-chain.
 * Called after indexing stake/unstake events.
 */
export async function solanaUpdateUserTeamStats(
  userAddress: string,
  teamSize: number,
  teamTotalStaked: number
): Promise<{ txHash: string }> {
  const program   = getProgram();
  const owner     = getOwner();
  const [platPda] = platformPda();
  const targetKey = new PublicKey(userAddress);
  const [targetPda] = userPda(targetKey);
  const tx = await (program.methods as any)
    .updateUserTeamStats(new BN(teamSize), toLamports(teamTotalStaked))
    .accounts({ platform: platPda, userAccount: targetPda, authority: owner })
    .rpc();
  return { txHash: tx };
}

// ── On-chain history ───────────────────────────────────────────────────────────

const INSTRUCTION_TYPE_MAP: Record<string, import('@/types').TxRecord['type']> = {
  'Instruction: Stake':    'stake',
  'Instruction: Claim':    'claim',
  'Instruction: Compound': 'compound',
  'Instruction: Unstake':  'unstake',
};

/**
 * Fetch on-chain activity for a wallet from the Solana staking program.
 * Looks up signatures for the user's PDA (involved in all staking txns).
 * Returns TxRecord[] sorted newest-first.
 */
export async function solanaGetOnChainHistory(address: string): Promise<import('@/types').TxRecord[]> {
  const programAddr = NETWORK_CONFIG.solana.contractAddress;
  if (!programAddr || programAddr.toUpperCase().startsWith('YOUR_')) return [];

  try {
    const connection = new Connection(NETWORK_CONFIG.solana.rpcUrl || 'https://api.mainnet-beta.solana.com', 'confirmed');
    const owner = new PublicKey(address);
    const [userAccPda] = userPda(owner);

    const sigs = await connection.getSignaturesForAddress(userAccPda, { limit: 100 });
    const records: import('@/types').TxRecord[] = [];

    await Promise.allSettled(
      sigs.map(async (sig) => {
        if (sig.err) return;
        try {
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          });
          if (!tx) return;

          const logs: string[] = tx.meta?.logMessages ?? [];
          const ts = (sig.blockTime ?? 0) * 1000;

          let type: import('@/types').TxRecord['type'] | null = null;
          for (const log of logs) {
            for (const [key, val] of Object.entries(INSTRUCTION_TYPE_MAP)) {
              if (log.includes(key)) { type = val; break; }
            }
            if (type) break;
          }
          if (!type) return;

          // Try to read token balance delta for the user's stake ATA
          let amount = 0;
          const preBalances  = tx.meta?.preTokenBalances  ?? [];
          const postBalances = tx.meta?.postTokenBalances ?? [];
          const stakeMint = NETWORK_CONFIG.solana.stakeTokenAddress;
          const userAta = ata(new PublicKey(stakeMint), owner).toBase58();

          const pre  = preBalances.find(b  => b.mint === stakeMint && b.owner === address);
          const post = postBalances.find(b => b.mint === stakeMint && b.owner === address);
          if (pre && post) {
            const diff = (post.uiTokenAmount.uiAmount ?? 0) - (pre.uiTokenAmount.uiAmount ?? 0);
            amount = Math.abs(diff);
          }

          const labelMap: Record<string, string> = {
            stake:    'Staked FBiT on Solana',
            claim:    'Claimed rewards on Solana',
            compound: 'Compounded rewards on Solana',
            unstake:  'Unstaked FBiT on Solana',
          };

          records.push({
            id: `sol-${sig.signature}`,
            type,
            label: labelMap[type],
            amount,
            txHash: sig.signature,
            timestamp: ts,
            status: 'success',
            network: 'solana',
          });
        } catch {
          // skip individual tx parse failures
        }
      })
    );

    return records.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

