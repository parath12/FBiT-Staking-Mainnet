'use client';

/**
 * Polygon FBiTStaking contract service (ethers v6)
 *
 * All public methods throw on error — callers should catch.
 * Amount parameters are in token units (not wei).
 */

import { BrowserProvider, JsonRpcProvider, Contract, parseUnits, formatUnits } from 'ethers';
import { FBIT_STAKING_ABI, ERC20_ABI } from './abi';
import { NETWORK_CONFIG } from '@/lib/config';
import type { PlatformStats, StakeEntry, UserAccount, ReferralInfo, ReferralEntry } from '@/types';

const DECIMALS = 6;

function toWei(amount: number): bigint {
  return parseUnits(amount.toFixed(DECIMALS), DECIMALS);
}

function fromWei(raw: bigint): number {
  return parseFloat(formatUnits(raw, DECIMALS));
}

async function assertPolygonMainnet(): Promise<void> {
  const provider = await getProvider();
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  if (chainId !== 137) {
    throw new Error(
      `Wrong network — please switch to Polygon Mainnet (chain 137). Currently on chain ${chainId}.`
    );
  }
}

/**
 * Returns an EIP-1193 BrowserProvider from whichever EVM source is available:
 * 1. window.ethereum (MetaMask, Coinbase, Trust, Rabby, etc.)
 * 2. window.BinanceChain (Binance Web3 Wallet)
 * 3. Reown / WalletConnect provider via AppKit
 */
async function getProvider(): Promise<BrowserProvider> {
  const w = (window as any);
  const injected = w.ethereum ?? w.BinanceChain;
  if (injected) return new BrowserProvider(injected);

  // Fall back to Reown/WalletConnect provider
  try {
    const { appKitModal } = await import('@/lib/reown');
    if (appKitModal) {
      const walletProvider = await (appKitModal as any).getWalletProvider?.();
      if (walletProvider) return new BrowserProvider(walletProvider as any);
    }
  } catch {}

  throw new Error('No EVM wallet found. Install MetaMask, Coinbase Wallet, or connect via WalletConnect.');
}

// Reliable Polygon RPC endpoints tried in order (polygon-rpc.com returns 403)
const POLYGON_RPC_FALLBACKS = [
  NETWORK_CONFIG.polygon.rpcUrl,
  'https://rpc.ankr.com/polygon',
  'https://polygon-mainnet.public.blastapi.io',
].filter(Boolean);

/**
 * Read-only RPC provider — no wallet needed, used for view calls.
 */
function getReadOnlyProvider(): JsonRpcProvider {
  return new JsonRpcProvider(
    NETWORK_CONFIG.polygon.rpcUrl || 'https://rpc.ankr.com/polygon'
  );
}

/**
 * Fetch FBiT ERC-20 balance for a Polygon wallet.
 * Tries each RPC in POLYGON_RPC_FALLBACKS until one succeeds.
 */
export async function polygonGetTokenBalance(address: string): Promise<number> {
  const { stakeTokenAddress } = NETWORK_CONFIG.polygon;
  for (const rpc of POLYGON_RPC_FALLBACKS) {
    try {
      const provider = new JsonRpcProvider(rpc);
      const token = new Contract(stakeTokenAddress, ERC20_ABI, provider);
      const raw: bigint = await token.balanceOf(address);
      return fromWei(raw);
    } catch {
      // Try next RPC
    }
  }
  return 0;
}

/** Read-only staking contract (no signer). */
function getReadOnlyStakingContract(): Contract {
  return new Contract(NETWORK_CONFIG.polygon.contractAddress, FBIT_STAKING_ABI, getReadOnlyProvider());
}

/** Read-only ERC-20 token contract. */
function getReadOnlyTokenContract(tokenAddress: string): Contract {
  return new Contract(tokenAddress, ERC20_ABI, getReadOnlyProvider());
}

async function getStakingContract(withSigner = true): Promise<Contract> {
  const { contractAddress } = NETWORK_CONFIG.polygon;
  const provider = await getProvider();
  const signerOrProvider = withSigner ? await provider.getSigner() : provider;
  return new Contract(contractAddress, FBIT_STAKING_ABI, signerOrProvider);
}

async function getTokenContract(tokenAddress: string, withSigner = true): Promise<Contract> {
  const provider = await getProvider();
  const signerOrProvider = withSigner ? await provider.getSigner() : provider;
  return new Contract(tokenAddress, ERC20_ABI, signerOrProvider);
}

async function ensureApproval(tokenAddress: string, spender: string, amount: bigint): Promise<void> {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();
  const token = await getTokenContract(tokenAddress);
  const allowance: bigint = await token.allowance(owner, spender);
  if (allowance < amount) {
    // Some tokens (e.g. USDT) require resetting allowance to 0 before re-approving.
    // Attempt reset first if there's an existing non-zero allowance.
    if (allowance > 0n) {
      try {
        const resetTx = await token.approve(spender, 0n);
        await resetTx.wait();
      } catch {
        // Token may not require reset — continue
      }
    }
    const tx = await token.approve(spender, amount);
    await tx.wait();
  }
}

// Safe hash extraction: tx.wait() returns null on timeout; tx always has .hash.
function txHash(tx: { hash: string }, receipt: { hash?: string } | null): string {
  return receipt?.hash ?? tx.hash;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function polygonFetchPlatformStats(): Promise<PlatformStats | null> {
  if (!NETWORK_CONFIG.polygon.contractAddress ||
      NETWORK_CONFIG.polygon.contractAddress.toUpperCase().startsWith('YOUR_')) return null;
  try {
    const contract = getReadOnlyStakingContract();
    const [totalStaked, totalUsers, rewardPoolBalance, rewardRate, referralRewardRate, paused, totalBurned, annualEmission, burnBps, effectiveAPY, isRenounced, feeRecipient, totalFeesCollected, totalReserve, emissionStartTime, totalEmissionReleased, releasableEmission, totalYearlyBurned, lastYearBurnTime, remainingYears, maxPendingRewards] =
      await Promise.all([
        contract.totalStaked(),
        contract.totalUsers(),
        contract.rewardPoolBalance(),
        contract.rewardRate(),
        contract.referralRewardRate(),
        contract.paused(),
        contract.totalBurned(),
        contract.ANNUAL_EMISSION(),
        contract.BURN_BPS(),
        contract.getEffectiveAPY(),
        contract.isRenounced(),
        contract.feeRecipient(),
        contract.totalFeesCollected(),
        contract.totalReserve(),
        contract.emissionStartTime(),
        contract.totalEmissionReleased(),
        contract.getReleasableEmission(),
        contract.totalYearlyBurned(),
        contract.lastYearBurnTime(),
        contract.getRemainingYears(),
        contract.getMaxPendingRewards(),
      ]);
    return {
      totalStaked: fromWei(totalStaked),
      totalUsers: Number(totalUsers),
      rewardPoolBalance: fromWei(rewardPoolBalance),
      rewardRate: Number(rewardRate),
      referralRewardRate: Number(referralRewardRate),
      isPaused: Boolean(paused),
      totalBurned: fromWei(totalBurned),
      annualEmission: fromWei(annualEmission),
      burnBps: Number(burnBps),
      effectiveAPY: Number(effectiveAPY),
      isRenounced: Boolean(isRenounced),
      feeRecipient: String(feeRecipient),
      totalFeesCollected: fromWei(totalFeesCollected),
      totalReserve: fromWei(totalReserve),
      emissionStartTime: Number(emissionStartTime),
      totalEmissionReleased: fromWei(totalEmissionReleased),
      releasableEmission: fromWei(releasableEmission),
      totalYearlyBurned: fromWei(totalYearlyBurned),
      lastYearBurnTime: Number(lastYearBurnTime),
      remainingYears: Number(remainingYears),
      maxPendingRewards: fromWei(maxPendingRewards),
    };
  } catch {
    return null;
  }
}

export async function polygonFetchUserTeamInfo(
  address: string
): Promise<{ tierIndex: number; bonusBps: number; teamTotalStaked: number; teamSize: number } | null> {
  try {
    const contract = getReadOnlyStakingContract();
    const [tierInfo, userInfo] = await Promise.all([
      contract.getTeamTierInfo(address),
      contract.users(address),
    ]);
    return {
      tierIndex:       Number(tierInfo.tierIndex),
      bonusBps:        Number(tierInfo.bonusBps),
      teamTotalStaked: fromWei(tierInfo.teamTotalStaked),
      teamSize:        Number(userInfo.teamSize),
    };
  } catch {
    return null;
  }
}

export async function polygonIsRegistered(address: string): Promise<boolean> {
  try {
    const contract = getReadOnlyStakingContract();
    const user = await contract.users(address);
    return Boolean(user.isRegistered);
  } catch {
    return false;
  }
}

export async function polygonRegisterUser(referrer?: string): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.registerUser(referrer ?? '0x0000000000000000000000000000000000000000');
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonStake(
  amount: number,
  referrer?: string
): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const { contractAddress, stakeTokenAddress } = NETWORK_CONFIG.polygon;
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const registered = await polygonIsRegistered(address);
  if (!registered) {
    await polygonRegisterUser(referrer);
  }

  const wei = toWei(amount);
  await ensureApproval(stakeTokenAddress, contractAddress, wei);

  const contract = await getStakingContract();
  const tx = await contract.stake(wei);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonGetEffectiveAPY(): Promise<number> {
  try {
    const contract = getReadOnlyStakingContract();
    const raw: bigint = await contract.getEffectiveAPY();
    return Number(raw); // in basis points (6000 = 60%, 50000 = 500%)
  } catch {
    return 6000; // fallback 60% (MIN_APY_BPS)
  }
}

export async function polygonClaimRewards(
  stakeId: number | string
): Promise<{ txHash: string; reward: number }> {
  await assertPolygonMainnet();
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const readContract = getReadOnlyStakingContract();
  let reward = 0;
  try {
    const raw: bigint = await readContract.getPendingReward(address, stakeId);
    reward = fromWei(raw);
  } catch {}

  const contract = await getStakingContract();
  const tx = await contract.claimRewards(stakeId);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt), reward };
}

export async function polygonCompoundRewards(
  stakeId: number | string
): Promise<{ txHash: string; reward: number }> {
  await assertPolygonMainnet();
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const readContract = getReadOnlyStakingContract();
  let reward = 0;
  try {
    const raw: bigint = await readContract.getPendingReward(address, stakeId);
    reward = fromWei(raw);
  } catch {}

  const contract = await getStakingContract();
  const tx = await contract.compoundRewards(stakeId);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt), reward };
}

export async function polygonUnstake(stakeId: number | string): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.unstake(stakeId);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonGetUserStakes(address: string): Promise<StakeEntry[]> {
  try {
    const contract = getReadOnlyStakingContract();
    const raw = await contract.getUserStakes(address);
    return (raw as any[]).map((s, i) => ({
      id: i,
      amount: fromWei(s.amount),
      lockPeriodIndex: Number(s.lockPeriodIndex),
      stakedAt: Number(s.stakedAt),
      unlockAt: Number(s.unlockAt),
      lastClaimAt: Number(s.lastClaimAt),
      totalClaimed: fromWei(s.totalClaimed),
      isActive: Boolean(s.isActive),
      apy: Number(s.apy),
    }));
  } catch {
    return [];
  }
}


export async function polygonGetUserAccount(address: string): Promise<UserAccount | null> {
  try {
    const contract = getReadOnlyStakingContract();
    const user = await contract.users(address);
    return {
      address,
      totalStaked:          fromWei(user.totalStaked),
      totalRewardsEarned:   fromWei(user.totalRewardsEarned),
      totalReferralRewards: fromWei(user.totalReferralRewards),
      referrer:             user.referrer === '0x0000000000000000000000000000000000000000' ? null : user.referrer,
      referralCount:        Number(user.referralCount),
      teamSize:             Number(user.teamSize),
      teamTotalStaked:      fromWei(user.teamTotalStaked),
      isBlocked:            Boolean(user.isBlocked),
      registeredAt:         Number(user.registeredAt),
    };
  } catch {
    return null;
  }
}

// Commission rates in basis points per level (mirrors contract REFERRAL_PERCENTAGES)
const REFERRAL_LEVEL_BPS = [25, 50, 125, 150, 200, 325, 350, 425, 550, 800] as const;
const MAX_REFERRAL_DEPTH   = 10;
const MAX_REFERRAL_ENTRIES = 100; // cap total entries to avoid excessive RPC calls

export async function polygonGetReferralInfo(address: string): Promise<ReferralInfo | null> {
  try {
    const contract = getReadOnlyStakingContract();

    // Authoritative counts come from on-chain user struct.
    const user = await contract.users(address);
    const totalReferrals       = Number(user.referralCount);
    const totalReferralRewards = fromWei(user.totalReferralRewards);

    // BFS across up to MAX_REFERRAL_DEPTH levels.
    // parentAddresses = addresses whose direct referrals form the next level.
    let referrals: ReferralEntry[] = [];
    try {
      let parentAddresses: string[] = [address];

      for (let lvl = 1; lvl <= MAX_REFERRAL_DEPTH && referrals.length < MAX_REFERRAL_ENTRIES; lvl++) {
        // Collect all child addresses from every parent at this level
        const childAddresses: string[] = [];
        await Promise.allSettled(
          parentAddresses.map(async (addr) => {
            try {
              const addrs = await contract.getReferrals(addr);
              childAddresses.push(...(addrs as string[]));
            } catch {}
          })
        );

        if (childAddresses.length === 0) break;

        // Cap to remaining slots
        const slice    = childAddresses.slice(0, MAX_REFERRAL_ENTRIES - referrals.length);
        const levelBps = REFERRAL_LEVEL_BPS[lvl - 1];

        const userResults = await Promise.allSettled(
          slice.map((a: string) => contract.users(a))
        );

        slice.forEach((refAddr, i) => {
          const res = userResults[i];
          const ru  = res.status === 'fulfilled' ? res.value : null;
          const stakedAmount = ru ? fromWei(ru.totalStaked) : 0;
          referrals.push({
            address:      refAddr,
            level:        lvl,
            stakedAmount,
            rewardEarned: stakedAmount * levelBps / 10_000,
            registeredAt: ru ? Number(ru.registeredAt) : 0,
          });
        });

        if (referrals.length >= MAX_REFERRAL_ENTRIES) break;
        parentAddresses = childAddresses;
      }
    } catch {
      // Referral tree fetch failed — return count-only result with empty list.
    }

    return {
      totalReferrals,
      totalReferralRewards,
      referralLink: '',
      referrals,
      chain:        [],
    };
  } catch {
    return null;
  }
}

// ── Admin ──────────────────────────────────────────────────────────────────────

export async function polygonRenounceOwnership(): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.renounceOwnershipWithFee();
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonDepositReserve(amount: number): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const { contractAddress, rewardTokenAddress } = NETWORK_CONFIG.polygon;
  const wei = toWei(amount);
  await ensureApproval(rewardTokenAddress, contractAddress, wei);
  const contract = await getStakingContract();
  const tx = await contract.depositReserve(wei);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonReleaseEmission(): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.releaseEmission();
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonBurnUnusedPool(amount: number): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.burnUnusedPool(toWei(amount));
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonFundRewardPool(amount: number): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const { contractAddress, rewardTokenAddress } = NETWORK_CONFIG.polygon;
  const wei = toWei(amount);
  await ensureApproval(rewardTokenAddress, contractAddress, wei);
  const contract = await getStakingContract();
  const tx = await contract.fundRewardPool(wei);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonSetRewardRate(rate: number): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.setRewardRate(rate);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonSetReferralRewardRate(rate: number): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.setReferralRewardRate(rate);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonBlockUser(userAddress: string): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.blockUser(userAddress);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonUnblockUser(userAddress: string): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.unblockUser(userAddress);
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonTogglePause(currentlyPaused: boolean): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = currentlyPaused ? await contract.unpause() : await contract.pause();
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

// ── On-chain history ───────────────────────────────────────────────────────────

/**
 * Fetch on-chain activity for a wallet from Polygon contract events.
 * Returns TxRecord[] sorted newest-first.
 */
export async function polygonGetOnChainHistory(address: string): Promise<import('@/types').TxRecord[]> {
  const { contractAddress } = NETWORK_CONFIG.polygon;
  if (!contractAddress || contractAddress.toUpperCase().startsWith('YOUR_')) return [];

  const contract = getReadOnlyStakingContract();
  const records: import('@/types').TxRecord[] = [];

  // Collect all events in parallel; each inner try isolates failures per type
  const blockCache = new Map<number, number>(); // blockNumber → timestamp(ms)

  async function getTs(ev: { blockNumber: number; getBlock: () => Promise<{ timestamp: number }> }): Promise<number> {
    if (blockCache.has(ev.blockNumber)) return blockCache.get(ev.blockNumber)!;
    try {
      const b = await ev.getBlock();
      const ts = b.timestamp * 1000;
      blockCache.set(ev.blockNumber, ts);
      return ts;
    } catch {
      return Date.now();
    }
  }

  const settled = await Promise.allSettled([
    // 1. TokensStaked
    (async () => {
      const evs = await contract.queryFilter(contract.filters.TokensStaked(address));
      for (const ev of evs) {
        const args = (ev as any).args;
        const ts = await getTs(ev as any);
        records.push({
          id: `poly-stake-${ev.transactionHash}`,
          type: 'stake',
          label: 'Staked FBiT on Polygon',
          amount: fromWei(args.amount),
          txHash: ev.transactionHash,
          timestamp: ts,
          status: 'success',
          network: 'polygon',
        });
      }
    })(),

    // 2. RewardsClaimed
    (async () => {
      const evs = await contract.queryFilter(contract.filters.RewardsClaimed(address));
      for (const ev of evs) {
        const args = (ev as any).args;
        const ts = await getTs(ev as any);
        records.push({
          id: `poly-claim-${ev.transactionHash}`,
          type: 'claim',
          label: 'Claimed rewards on Polygon',
          amount: fromWei(args.amount),
          txHash: ev.transactionHash,
          timestamp: ts,
          status: 'success',
          network: 'polygon',
        });
      }
    })(),

    // 3. RewardsCompounded
    (async () => {
      const evs = await contract.queryFilter(contract.filters.RewardsCompounded(address));
      for (const ev of evs) {
        const args = (ev as any).args;
        const ts = await getTs(ev as any);
        records.push({
          id: `poly-compound-${ev.transactionHash}`,
          type: 'compound',
          label: 'Compounded rewards on Polygon',
          amount: fromWei(args.amount),
          txHash: ev.transactionHash,
          timestamp: ts,
          status: 'success',
          network: 'polygon',
        });
      }
    })(),

    // 4. TokensUnstaked
    (async () => {
      const evs = await contract.queryFilter(contract.filters.TokensUnstaked(address));
      for (const ev of evs) {
        const args = (ev as any).args;
        const ts = await getTs(ev as any);
        records.push({
          id: `poly-unstake-${ev.transactionHash}`,
          type: 'unstake',
          label: 'Unstaked FBiT on Polygon',
          amount: fromWei(args.amount),
          txHash: ev.transactionHash,
          timestamp: ts,
          status: 'success',
          network: 'polygon',
        });
      }
    })(),

    // 5. ReferralReward (where this address is the referrer)
    (async () => {
      const evs = await contract.queryFilter(contract.filters.ReferralReward(null, address));
      for (const ev of evs) {
        const args = (ev as any).args;
        const ts = await getTs(ev as any);
        records.push({
          id: `poly-ref-${ev.transactionHash}-${args.level}`,
          type: 'referral',
          label: `Referral reward (Level ${args.level}) on Polygon`,
          amount: fromWei(args.amount),
          txHash: ev.transactionHash,
          timestamp: ts,
          status: 'success',
          network: 'polygon',
          referralLevel: Number(args.level),
        });
      }
    })(),

    // 6. TeamBonusApplied
    (async () => {
      const evs = await contract.queryFilter(contract.filters.TeamBonusApplied(address));
      for (const ev of evs) {
        const args = (ev as any).args;
        const ts = await getTs(ev as any);
        records.push({
          id: `poly-bonus-${ev.transactionHash}`,
          type: 'team_bonus',
          label: 'Team bonus reward on Polygon',
          amount: fromWei(args.bonusAmount),
          txHash: ev.transactionHash,
          timestamp: ts,
          status: 'success',
          network: 'polygon',
        });
      }
    })(),
  ]);

  // Log any failures silently (don't throw)
  settled.forEach(r => { if (r.status === 'rejected') console.warn('[polygonGetOnChainHistory]', r.reason); });

  return records.sort((a, b) => b.timestamp - a.timestamp);
}

export async function polygonSetBurnBps(burnBps: number): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.setBurnBps(BigInt(burnBps));
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonSetAnnualEmission(annualEmission: number): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const tx = await contract.setAnnualEmission(toWei(annualEmission));
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}

export async function polygonSetTeamTargetTier(
  index: number,
  minTeamStaked: number,
  bonusBps: number
): Promise<{ txHash: string }> {
  await assertPolygonMainnet();
  const contract = await getStakingContract();
  const minStakedWei = toWei(minTeamStaked);
  const tx = await contract.setTeamTargetTier(index, minStakedWei, BigInt(bonusBps));
  const receipt = await tx.wait();
  return { txHash: txHash(tx, receipt) };
}
