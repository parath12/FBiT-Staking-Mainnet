import { useCallback } from 'react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { IDL } from '@/idl/fbit_staking';
import { NETWORK_CONFIG } from '@/lib/config';
import { TransactionResult, UserAccount, StakeEntry, PlatformStats } from '@/types';

const SOLANA_CONFIG = NETWORK_CONFIG.solana;
const STAKE_TOKEN_MINT = new PublicKey(SOLANA_CONFIG.stakeTokenAddress);
const REWARD_TOKEN_MINT = new PublicKey(SOLANA_CONFIG.rewardTokenAddress);

function getProgramId(): PublicKey {
  const addr = SOLANA_CONFIG.contractAddress;
  if (!addr) throw new Error('Solana program ID not configured. Set NEXT_PUBLIC_SOLANA_PROGRAM_ID in your .env.local');
  return new PublicKey(addr);
}

// ===== PDA HELPERS =====
const getPlatformPDA = () =>
  PublicKey.findProgramAddressSync([Buffer.from('platform')], getProgramId());

const getUserPDA = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('user'), owner.toBuffer()], getProgramId());

const getStakeEntryPDA = (owner: PublicKey, timestamp: BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('stake'), owner.toBuffer(), timestamp.toArrayLike(Buffer, 'le', 8)],
    getProgramId()
  );

export function useSolanaStaking() {
  const getProgram = useCallback(() => {
    const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
    const wallet = (window as any)?.solana;
    if (!wallet) throw new Error('Solana wallet not found');
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (Program as any)(IDL, getProgramId(), provider) as any;
  }, []);

  const getConnection = useCallback(() => new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed'), []);

  const registerUser = useCallback(async (referrer?: string): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const owner = program.provider.publicKey!;
      const [platformPDA] = getPlatformPDA();
      const [userPDA] = getUserPDA(owner);
      let referrerKey: PublicKey | null = null;
      let referrerPDA: PublicKey;

      if (referrer) {
        referrerKey = new PublicKey(referrer);
        [referrerPDA] = getUserPDA(referrerKey);
      } else {
        [referrerPDA] = getUserPDA(owner);
      }

      const tx = await program.methods.registerUser(referrerKey).accounts({
        platform: platformPDA, userAccount: userPDA, referrerAccount: referrerPDA,
        owner, systemProgram: SystemProgram.programId,
      }).rpc();

      return { success: true, txHash: tx, message: 'User registered successfully!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Registration failed' };
    }
  }, [getProgram]);

  const stakeTokens = useCallback(async (amount: number, lockPeriodIndex: number): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const owner = program.provider.publicKey!;
      const [platformPDA] = getPlatformPDA();
      const [userPDA] = getUserPDA(owner);
      const now = new BN(Math.floor(Date.now() / 1000));
      const [stakeEntryPDA] = getStakeEntryPDA(owner, now);
      const userTokenAccount = await getAssociatedTokenAddress(STAKE_TOKEN_MINT, owner);
      const stakeVault = await getAssociatedTokenAddress(STAKE_TOKEN_MINT, platformPDA, true);
      const amountBN = new BN(amount * Math.pow(10, SOLANA_CONFIG.stakeTokenDecimals));

      const tx = await program.methods.stake(amountBN, lockPeriodIndex).accounts({
        platform: platformPDA, userAccount: userPDA, stakeEntry: stakeEntryPDA,
        userTokenAccount, stakeVault, owner, tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      return { success: true, txHash: tx, message: `Staked ${amount} FBiT!` };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Staking failed' };
    }
  }, [getProgram]);

  const claimRewards = useCallback(async (stakeEntryAddress: string): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const owner = program.provider.publicKey!;
      const [platformPDA] = getPlatformPDA();
      const [userPDA] = getUserPDA(owner);
      const userTokenAccount = await getAssociatedTokenAddress(REWARD_TOKEN_MINT, owner);
      const rewardVault = await getAssociatedTokenAddress(REWARD_TOKEN_MINT, platformPDA, true);

      const tx = await program.methods.claimRewards(new BN(0)).accounts({
        platform: platformPDA, userAccount: userPDA, stakeEntry: new PublicKey(stakeEntryAddress),
        userTokenAccount, rewardVault, owner, tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();

      return { success: true, txHash: tx, message: 'Rewards claimed!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Claim failed' };
    }
  }, [getProgram]);

  const compoundRewards = useCallback(async (stakeEntryAddress: string): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const owner = program.provider.publicKey!;
      const [platformPDA] = getPlatformPDA();
      const [userPDA] = getUserPDA(owner);

      const tx = await program.methods.compoundRewards().accounts({
        platform: platformPDA, userAccount: userPDA,
        stakeEntry: new PublicKey(stakeEntryAddress), owner,
      }).rpc();

      return { success: true, txHash: tx, message: 'Rewards compounded!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Compound failed' };
    }
  }, [getProgram]);

  const unstake = useCallback(async (stakeEntryAddress: string): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const owner = program.provider.publicKey!;
      const [platformPDA] = getPlatformPDA();
      const [userPDA] = getUserPDA(owner);
      const userTokenAccount = await getAssociatedTokenAddress(STAKE_TOKEN_MINT, owner);
      const stakeVault = await getAssociatedTokenAddress(STAKE_TOKEN_MINT, platformPDA, true);

      const tx = await program.methods.unstake().accounts({
        platform: platformPDA, userAccount: userPDA,
        stakeEntry: new PublicKey(stakeEntryAddress),
        userTokenAccount, stakeVault, owner, tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();

      return { success: true, txHash: tx, message: 'Tokens unstaked!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Unstake failed' };
    }
  }, [getProgram]);

  const fetchUserAccount = useCallback(async (address: string): Promise<UserAccount | null> => {
    try {
      const program = getProgram();
      const [userPDA] = getUserPDA(new PublicKey(address));
      const account = await (program.account as any).UserAccount.fetch(userPDA);
      const decimals = Math.pow(10, SOLANA_CONFIG.stakeTokenDecimals);
      return {
        address,
        totalStaked: account.totalStaked.toNumber() / decimals,
        totalRewardsEarned: account.totalRewardsEarned.toNumber() / decimals,
        totalReferralRewards: account.totalReferralRewards.toNumber() / decimals,
        referrer: account.referrer ? account.referrer.toBase58() : null,
        referralCount: account.referralCount.toNumber(),
        isBlocked: account.isBlocked,
        registeredAt: account.registeredAt.toNumber(),
        teamSize: 0,
        teamTotalStaked: 0,
      };
    } catch { return null; }
  }, [getProgram]);

  const fetchUserStakes = useCallback(async (address: string): Promise<StakeEntry[]> => {
    try {
      const program = getProgram();
      const allStakes = await (program.account as any).StakeEntry.all([
        { memcmp: { offset: 8, bytes: new PublicKey(address).toBase58() } },
      ]);
      const decimals = Math.pow(10, SOLANA_CONFIG.stakeTokenDecimals);
      return allStakes.map((s: any) => ({
        id: s.publicKey.toBase58(),
        amount: s.account.amount.toNumber() / decimals,
        lockPeriodIndex: s.account.lockPeriodIndex,
        stakedAt: s.account.stakedAt.toNumber(),
        unlockAt: s.account.unlockAt.toNumber(),
        lastClaimAt: s.account.lastClaimAt.toNumber(),
        totalClaimed: s.account.totalClaimed.toNumber() / decimals,
        isActive: s.account.isActive,
        apy: s.account.apy.toNumber(),
      }));
    } catch { return []; }
  }, [getProgram]);

  const fetchPlatformStats = useCallback(async (): Promise<PlatformStats | null> => {
    try {
      const program = getProgram();
      const [platformPDA] = getPlatformPDA();
      const account = await (program.account as any).Platform.fetch(platformPDA);
      const dec = Math.pow(10, SOLANA_CONFIG.stakeTokenDecimals);
      const fromLamports = (v: any) => (v?.toNumber?.() ?? 0) / dec;

      const totalStaked      = fromLamports(account.totalStaked);
      const annualEmission   = fromLamports(account.annualEmission);
      const burnBps          = account.burnBps ? Number(account.burnBps) : 1000;

      // Derive effectiveAPY same way as lib/contracts/solana.ts
      let effectiveAPY = 6_000;
      if (totalStaked > 0 && annualEmission > 0) {
        const raw = Math.round((annualEmission / totalStaked) * 10_000);
        effectiveAPY = Math.min(50_000, Math.max(6_000, raw));
      }

      const totalReserve           = fromLamports(account.totalReserve);
      const totalEmissionReleased  = fromLamports(account.totalEmissionReleased);
      const emissionStartTime      = account.emissionStartTime ? Number(account.emissionStartTime) : 0;

      // Releasable emission: what can be released right now
      let releasableEmission = 0;
      if (emissionStartTime > 0 && totalReserve > 0 && annualEmission > 0) {
        const elapsed   = Math.floor(Date.now() / 1000) - emissionStartTime;
        const due       = Math.min((annualEmission * elapsed) / (365 * 86400), totalReserve);
        releasableEmission = Math.max(0, due - totalEmissionReleased);
      }

      const remainingYears = annualEmission > 0 && totalReserve > totalEmissionReleased
        ? Math.floor((totalReserve - totalEmissionReleased) / annualEmission)
        : 0;

      return {
        totalStaked,
        totalUsers:            account.totalUsers?.toNumber?.() ?? 0,
        rewardPoolBalance:     fromLamports(account.rewardPoolBalance),
        rewardRate:            account.rewardRate?.toNumber?.() ?? 0,
        referralRewardRate:    account.referralRewardRate?.toNumber?.() ?? 0,
        isPaused:              Boolean(account.isPaused),
        totalBurned:           fromLamports(account.totalBurned),
        annualEmission,
        burnBps,
        effectiveAPY,
        isRenounced:           Boolean(account.isRenounced),
        feeRecipient:          account.feeRecipient?.toBase58?.() ?? '',
        totalFeesCollected:    fromLamports(account.totalFeesCollected),
        totalReserve,
        emissionStartTime,
        totalEmissionReleased,
        releasableEmission,
        totalYearlyBurned:     fromLamports(account.totalYearlyBurned),
        lastYearBurnTime:      account.lastYearBurnTime ? Number(account.lastYearBurnTime) : 0,
        remainingYears,
        maxPendingRewards:     fromLamports(account.maxPendingRewards),
      };
    } catch { return null; }
  }, [getProgram]);

  const getTokenBalance = useCallback(async (address: string): Promise<number> => {
    try {
      const connection = getConnection();
      const tokenAccount = await getAssociatedTokenAddress(STAKE_TOKEN_MINT, new PublicKey(address));
      const balance = await connection.getTokenAccountBalance(tokenAccount);
      return parseFloat(balance.value.uiAmountString || '0');
    } catch { return 0; }
  }, [getConnection]);

  const fundRewardPool = useCallback(async (amount: number): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const authority = program.provider.publicKey!;
      const [platformPDA] = getPlatformPDA();
      const funderTokenAccount = await getAssociatedTokenAddress(REWARD_TOKEN_MINT, authority);
      const rewardVault = await getAssociatedTokenAddress(REWARD_TOKEN_MINT, platformPDA, true);
      const amountBN = new BN(amount * Math.pow(10, SOLANA_CONFIG.stakeTokenDecimals));

      const tx = await program.methods.fundRewardPool(amountBN).accounts({
        platform: platformPDA, authority, funderTokenAccount, rewardVault, tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();

      return { success: true, txHash: tx, message: `Funded ${amount} FBiT!` };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Funding failed' };
    }
  }, [getProgram]);

  const setRewardRate = useCallback(async (rate: number): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const [platformPDA] = getPlatformPDA();
      const tx = await program.methods.setRewardRate(new BN(rate)).accounts({
        platform: platformPDA, authority: program.provider.publicKey!,
      }).rpc();
      return { success: true, txHash: tx, message: 'Reward rate updated!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Update failed' };
    }
  }, [getProgram]);

  const setReferralRewardRate = useCallback(async (rate: number): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const [platformPDA] = getPlatformPDA();
      const tx = await program.methods.setReferralRewardRate(new BN(rate)).accounts({
        platform: platformPDA, authority: program.provider.publicKey!,
      }).rpc();
      return { success: true, txHash: tx, message: 'Referral rate updated!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Update failed' };
    }
  }, [getProgram]);

  const blockUser = useCallback(async (userAddress: string): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const [platformPDA] = getPlatformPDA();
      const [userPDA] = getUserPDA(new PublicKey(userAddress));
      const tx = await program.methods.blockUser().accounts({
        platform: platformPDA, userAccount: userPDA, authority: program.provider.publicKey!,
      }).rpc();
      return { success: true, txHash: tx, message: 'User blocked!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Block failed' };
    }
  }, [getProgram]);

  const unblockUser = useCallback(async (userAddress: string): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const [platformPDA] = getPlatformPDA();
      const [userPDA] = getUserPDA(new PublicKey(userAddress));
      const tx = await program.methods.unblockUser().accounts({
        platform: platformPDA, userAccount: userPDA, authority: program.provider.publicKey!,
      }).rpc();
      return { success: true, txHash: tx, message: 'User unblocked!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Unblock failed' };
    }
  }, [getProgram]);

  const togglePause = useCallback(async (): Promise<TransactionResult> => {
    try {
      const program = getProgram();
      const [platformPDA] = getPlatformPDA();
      const tx = await program.methods.togglePause().accounts({
        platform: platformPDA, authority: program.provider.publicKey!,
      }).rpc();
      return { success: true, txHash: tx, message: 'Platform pause toggled!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.message || 'Toggle failed' };
    }
  }, [getProgram]);

  return {
    registerUser, stakeTokens, claimRewards, compoundRewards, unstake,
    fetchUserAccount, fetchUserStakes, fetchPlatformStats, getTokenBalance,
    fundRewardPool, setRewardRate, setReferralRewardRate, blockUser, unblockUser, togglePause,
  };
}
