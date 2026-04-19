import { useCallback } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import { NETWORK_CONFIG } from '@/lib/config';
import { FBIT_STAKING_ABI, ERC20_ABI } from '@/lib/contracts/abi';
import { TransactionResult, StakeEntry, UserAccount, PlatformStats } from '@/types';

const POLYGON_CONFIG = NETWORK_CONFIG.polygon;

export function usePolygonStaking() {
  const getProvider = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('MetaMask or compatible wallet not found');
    }
    const provider = new BrowserProvider((window as any).ethereum);
    return provider;
  }, []);

  const getContract = useCallback(async (withSigner = false) => {
    const provider = await getProvider();
    if (withSigner) {
      const signer = await provider.getSigner();
      return new Contract(POLYGON_CONFIG.contractAddress, FBIT_STAKING_ABI, signer);
    }
    return new Contract(POLYGON_CONFIG.contractAddress, FBIT_STAKING_ABI, provider);
  }, [getProvider]);

  const getTokenContract = useCallback(async (tokenAddress: string, withSigner = false) => {
    const provider = await getProvider();
    if (withSigner) {
      const signer = await provider.getSigner();
      return new Contract(tokenAddress, ERC20_ABI, signer);
    }
    return new Contract(tokenAddress, ERC20_ABI, provider);
  }, [getProvider]);

  const ensureCorrectNetwork = useCallback(async () => {
    const provider = await getProvider();
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== POLYGON_CONFIG.chainId) {
      try {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${POLYGON_CONFIG.chainId!.toString(16)}` }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${POLYGON_CONFIG.chainId!.toString(16)}`,
              chainName: POLYGON_CONFIG.name,
              rpcUrls: [POLYGON_CONFIG.rpcUrl],
              blockExplorerUrls: [POLYGON_CONFIG.explorerUrl],
              nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            }],
          });
        }
      }
    }
  }, [getProvider]);

  const approveToken = useCallback(async (amount: bigint): Promise<boolean> => {
    try {
      const tokenContract = await getTokenContract(POLYGON_CONFIG.stakeTokenAddress, true);
      const tx = await tokenContract.approve(POLYGON_CONFIG.contractAddress, amount);
      await tx.wait();
      return true;
    } catch {
      return false;
    }
  }, [getTokenContract]);

  const registerUser = useCallback(async (referrer?: string): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const referrerAddress = referrer || ethers.ZeroAddress;
      const tx = await contract.registerUser(referrerAddress);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: 'Registered successfully!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Registration failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  const stakeTokens = useCallback(async (amount: number, lockPeriodIndex: number): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const decimals = POLYGON_CONFIG.stakeTokenDecimals;
      const amountWei = ethers.parseUnits(amount.toString(), decimals);

      const approved = await approveToken(amountWei);
      if (!approved) return { success: false, txHash: '', message: 'Token approval failed' };

      const contract = await getContract(true);
      const tx = await contract.stake(amountWei, lockPeriodIndex);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: `Staked ${amount} FBiT successfully!` };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Staking failed' };
    }
  }, [getContract, ensureCorrectNetwork, approveToken]);

  const claimRewards = useCallback(async (stakeId: number): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const tx = await contract.claimRewards(stakeId);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: 'Rewards claimed!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Claim failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  const compoundRewards = useCallback(async (stakeId: number): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const tx = await contract.compoundRewards(stakeId);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: 'Rewards compounded!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Compound failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  const unstake = useCallback(async (stakeId: number): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const tx = await contract.unstake(stakeId);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: 'Tokens unstaked!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Unstake failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  const fetchUserAccount = useCallback(async (address: string): Promise<UserAccount | null> => {
    try {
      const contract = await getContract();
      const user = await contract.users(address);
      if (!user.isRegistered) return null;
      return {
        address,
        totalStaked: parseFloat(ethers.formatUnits(user.totalStaked, POLYGON_CONFIG.stakeTokenDecimals)),
        totalRewardsEarned: parseFloat(ethers.formatUnits(user.totalRewardsEarned, POLYGON_CONFIG.stakeTokenDecimals)),
        totalReferralRewards: parseFloat(ethers.formatUnits(user.totalReferralRewards, POLYGON_CONFIG.stakeTokenDecimals)),
        referrer: user.referrer === ethers.ZeroAddress ? null : user.referrer,
        referralCount: Number(user.referralCount),
        isBlocked: user.isBlocked,
        registeredAt: Number(user.registeredAt),
        teamSize: 0,
        teamTotalStaked: 0,
      };
    } catch {
      return null;
    }
  }, [getContract]);

  const fetchUserStakes = useCallback(async (address: string): Promise<StakeEntry[]> => {
    try {
      const contract = await getContract();
      const rawStakes = await contract.getUserStakes(address);
      return rawStakes.map((s: any, i: number) => ({
        id: i,
        amount: parseFloat(ethers.formatUnits(s.amount, POLYGON_CONFIG.stakeTokenDecimals)),
        lockPeriodIndex: Number(s.lockPeriodIndex),
        stakedAt: Number(s.stakedAt),
        unlockAt: Number(s.unlockAt),
        lastClaimAt: Number(s.lastClaimAt),
        totalClaimed: parseFloat(ethers.formatUnits(s.totalClaimed, POLYGON_CONFIG.stakeTokenDecimals)),
        isActive: s.isActive,
        apy: Number(s.apy),
      }));
    } catch {
      return [];
    }
  }, [getContract]);

  const fetchPlatformStats = useCallback(async (): Promise<PlatformStats | null> => {
    try {
      const contract = await getContract();
      const dec = POLYGON_CONFIG.stakeTokenDecimals;
      const fmt = (v: bigint) => parseFloat(ethers.formatUnits(v, dec));

      const [
        totalStaked, totalUsers, rewardPool, rewardRate, referralRate, isPaused,
        totalBurned, annualEmission, burnBps, effectiveAPY,
        isRenounced, feeRecipient, totalFeesCollected,
        totalReserve, emissionStartTime, totalEmissionReleased,
        releasableEmission, totalYearlyBurned, lastYearBurnTime,
        remainingYears, maxPendingRewards,
      ] = await Promise.all([
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
        totalStaked:            fmt(totalStaked),
        totalUsers:             Number(totalUsers),
        rewardPoolBalance:      fmt(rewardPool),
        rewardRate:             Number(rewardRate),
        referralRewardRate:     Number(referralRate),
        isPaused:               Boolean(isPaused),
        totalBurned:            fmt(totalBurned),
        annualEmission:         fmt(annualEmission),
        burnBps:                Number(burnBps),
        effectiveAPY:           Number(effectiveAPY),
        isRenounced:            Boolean(isRenounced),
        feeRecipient:           String(feeRecipient),
        totalFeesCollected:     fmt(totalFeesCollected),
        totalReserve:           fmt(totalReserve),
        emissionStartTime:      Number(emissionStartTime),
        totalEmissionReleased:  fmt(totalEmissionReleased),
        releasableEmission:     fmt(releasableEmission),
        totalYearlyBurned:      fmt(totalYearlyBurned),
        lastYearBurnTime:       Number(lastYearBurnTime),
        remainingYears:         Number(remainingYears),
        maxPendingRewards:      fmt(maxPendingRewards),
      };
    } catch {
      return null;
    }
  }, [getContract]);

  const getTokenBalance = useCallback(async (address: string): Promise<number> => {
    try {
      const tokenContract = await getTokenContract(POLYGON_CONFIG.stakeTokenAddress);
      const balance = await tokenContract.balanceOf(address);
      return parseFloat(ethers.formatUnits(balance, POLYGON_CONFIG.stakeTokenDecimals));
    } catch {
      return 0;
    }
  }, [getTokenContract]);

  // Admin functions
  const fundRewardPool = useCallback(async (amount: number): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const amountWei = ethers.parseUnits(amount.toString(), POLYGON_CONFIG.stakeTokenDecimals);
      const tokenContract = await getTokenContract(POLYGON_CONFIG.rewardTokenAddress, true);
      const approveTx = await tokenContract.approve(POLYGON_CONFIG.contractAddress, amountWei);
      await approveTx.wait();

      const contract = await getContract(true);
      const tx = await contract.fundRewardPool(amountWei);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: `Funded ${amount} tokens to reward pool!` };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Funding failed' };
    }
  }, [getContract, getTokenContract, ensureCorrectNetwork]);

  const setRewardRate = useCallback(async (rate: number): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const tx = await contract.setRewardRate(rate);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: 'Reward rate updated!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Update failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  const setReferralRewardRate = useCallback(async (rate: number): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const tx = await contract.setReferralRewardRate(rate);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: 'Referral rate updated!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Update failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  const blockUser = useCallback(async (userAddress: string): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const tx = await contract.blockUser(userAddress);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: 'User blocked!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Block failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  const unblockUser = useCallback(async (userAddress: string): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const tx = await contract.unblockUser(userAddress);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: 'User unblocked!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Unblock failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  const togglePause = useCallback(async (currentlyPaused: boolean): Promise<TransactionResult> => {
    try {
      await ensureCorrectNetwork();
      const contract = await getContract(true);
      const tx = currentlyPaused ? await contract.unpause() : await contract.pause();
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: currentlyPaused ? 'Platform unpaused!' : 'Platform paused!' };
    } catch (error: any) {
      return { success: false, txHash: '', message: error.reason || error.message || 'Toggle failed' };
    }
  }, [getContract, ensureCorrectNetwork]);

  return {
    registerUser,
    stakeTokens,
    claimRewards,
    compoundRewards,
    unstake,
    fetchUserAccount,
    fetchUserStakes,
    fetchPlatformStats,
    getTokenBalance,
    fundRewardPool,
    setRewardRate,
    setReferralRewardRate,
    blockUser,
    unblockUser,
    togglePause,
  };
}
