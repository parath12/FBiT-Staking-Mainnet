// ===== NETWORK TYPES =====
export type NetworkType = 'solana' | 'polygon';

export type NetworkConfig = {
  name: string;
  type: NetworkType;
  rpcUrl: string;
  chainId?: number;
  explorerUrl: string;
  contractAddress: string;
  stakeTokenAddress: string;
  rewardTokenAddress: string;
  stakeTokenSymbol: string;
  stakeTokenDecimals: number;
  /** Solana only: token account that holds staked tokens (authority = platform PDA) */
  stakeVaultAddress?: string;
  /** Solana only: token account that holds reward tokens (authority = platform PDA) */
  rewardVaultAddress?: string;
};

// ===== LOCK PERIOD (single: 30 days) =====
export const LOCK_PERIOD = { days: 30, label: '30 Days' };

// Default display APY percent — actual effective APY is PoS-based and fetched from chain.
export let DYNAMIC_APY = 60;

// ===== REFERRAL LEVELS =====
export const REFERRAL_LEVELS = [
  { level: 1, percentage: 0.25 },
  { level: 2, percentage: 0.50 },
  { level: 3, percentage: 1.25 },
  { level: 4, percentage: 1.50 },
  { level: 5, percentage: 2.00 },
  { level: 6, percentage: 3.25 },
  { level: 7, percentage: 3.50 },
  { level: 8, percentage: 4.25 },
  { level: 9, percentage: 5.50 },
  { level: 10, percentage: 8.00 },
] as const;

// ===== TEAM TARGET BONUS TIERS =====
// 10-level bonus applied on top of staking rewards based on total team staked.
// Tier 1 (Bronze)  : 50 K tokens → +2 %
// Tier 10 (Titan)  : 1 B tokens  → +10 %
export const TEAM_TARGET_TIERS = [
  { tier: 1,  label: 'Bronze',   bonusPercentage: 2,   bonusBps: 200,  minTeamStaked: 200_000,          color: 'amber'   },
  { tier: 2,  label: 'Silver',   bonusPercentage: 3,   bonusBps: 300,  minTeamStaked: 350_000,         color: 'slate'   },
  { tier: 3,  label: 'Gold',     bonusPercentage: 4,   bonusBps: 400,  minTeamStaked: 500_000,         color: 'yellow'  },
  { tier: 4,  label: 'Platinum', bonusPercentage: 5,   bonusBps: 500,  minTeamStaked: 1_000_000,       color: 'cyan'    },
  { tier: 5,  label: 'Diamond',  bonusPercentage: 6,   bonusBps: 600,  minTeamStaked: 5_000_000,       color: 'purple'  },
  { tier: 6,  label: 'Ruby',     bonusPercentage: 7,   bonusBps: 700,  minTeamStaked: 10_000_000,      color: 'rose'    },
  { tier: 7,  label: 'Emerald',  bonusPercentage: 7.5, bonusBps: 750,  minTeamStaked: 50_000_000,      color: 'green'   },
  { tier: 8,  label: 'Sapphire', bonusPercentage: 8.5, bonusBps: 850,  minTeamStaked: 100_000_000,     color: 'blue'    },
  { tier: 9,  label: 'Obsidian', bonusPercentage: 9,   bonusBps: 900,  minTeamStaked: 500_000_000,     color: 'gray'    },
  { tier: 10, label: 'Titan',    bonusPercentage: 10,  bonusBps: 1000, minTeamStaked: 1_000_000_000,   color: 'brand'   },
] as const;

export type TeamTargetTier = typeof TEAM_TARGET_TIERS[number];

// Claim interval in seconds (12 hours)
export const CLAIM_COOLDOWN_SECONDS = 43200;

// ===== USER TYPES =====
export interface UserAccount {
  address: string;
  totalStaked: number;
  totalRewardsEarned: number;
  totalReferralRewards: number;
  referrer: string | null;
  referralCount: number;
  teamSize: number;        // total downline members (all levels)
  teamTotalStaked: number; // total FBiT staked by entire team
  isBlocked: boolean;
  registeredAt: number;
}

export interface StakeEntry {
  id: number | string;
  amount: number;
  lockPeriodIndex: number;
  stakedAt: number;
  unlockAt: number;
  lastClaimAt: number;
  totalClaimed: number;
  isActive: boolean;
  apy: number;
  pendingReward?: number;
}

export interface ReferralInfo {
  totalReferrals: number;
  totalReferralRewards: number;
  referralLink: string;
  referrals: ReferralEntry[];
  chain: string[];
}

export interface ReferralEntry {
  address: string;
  level: number;
  stakedAmount: number;
  rewardEarned: number;
  registeredAt: number;
}

// ===== PLATFORM TYPES =====
export interface PlatformStats {
  totalStaked: number;
  totalUsers: number;
  rewardPoolBalance: number;
  rewardRate: number;
  referralRewardRate: number;
  isPaused: boolean;
  totalBurned: number;
  /** Annual token emission driving PoS APY (token units, not raw) */
  annualEmission: number;
  /** Burn percentage on claim/compound in basis points (1000 = 10%) */
  burnBps: number;
  /** Current effective APY in basis points (e.g. 25000 = 250%). Fetched live from chain. */
  effectiveAPY: number;
  /** Total tokens deposited into the long-term reserve (not yet in rewardPoolBalance). */
  totalReserve: number;
  /** Unix timestamp when the reserve was first funded — emission clock starts here. */
  emissionStartTime: number;
  /** Cumulative tokens already released from reserve into rewardPoolBalance. */
  totalEmissionReleased: number;
  /** Tokens that can be released from reserve right now. */
  releasableEmission: number;
  /** Cumulative tokens burned via year-end unused-pool burns. */
  totalYearlyBurned: number;
  /** Timestamp of last year-end burn. Used to show when next burn is allowed. */
  lastYearBurnTime: number;
  /** Estimated years of emission remaining (auto-shortens with each year-end burn). */
  remainingYears: number;
  /** Conservative upper-bound of rewards currently owed to all active stakers. Year-end burn never burns below this floor. */
  maxPendingRewards: number;
  // Renouncement
  isRenounced: boolean;
  feeRecipient: string;       // address/pubkey of former admin
  totalFeesCollected: number; // cumulative passive fees paid out
}

// ===== ADMIN TYPES =====
export interface AdminAction {
  type: 'fund' | 'setRewardRate' | 'setReferralRate' | 'blockUser' | 'unblockUser' | 'pause' | 'unpause';
  params?: Record<string, any>;
}

// ===== TRANSACTION TYPES =====
export interface TransactionResult {
  success: boolean;
  txHash: string;
  message: string;
}

export interface TxRecord {
  id: string;
  type: 'stake' | 'claim' | 'compound' | 'unstake' | 'admin' | 'referral' | 'team_bonus';
  label: string;
  amount: number;
  txHash: string;
  timestamp: number;
  status: 'success' | 'failed';
  network: NetworkType;
  /** For referral: which level (1–10) */
  referralLevel?: number;
  /** For team_bonus: bonus % applied */
  bonusPercent?: number;
}

export interface WalletData {
  stakes: StakeEntry[];
  tokenBalance: number;
  transactions: TxRecord[];
  userAccount: UserAccount;
  referralInfo: ReferralInfo;
  teamStats: { teamSize: number; teamTotalStaked: number };
}
