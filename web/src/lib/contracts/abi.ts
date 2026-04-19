/**
 * Polygon FBiTStaking ABI (human-readable, ethers v6)
 */

export const FBIT_STAKING_ABI = [
  // ── Staking ────────────────────────────────────────────────────────────────
  'function registerUser(address referrer) external',
  'function stake(uint256 amount) external',
  'function claimRewards(uint256 stakeId) external',
  'function compoundRewards(uint256 stakeId) external',
  'function unstake(uint256 stakeId) external',

  // ── Admin ──────────────────────────────────────────────────────────────────
  'function renounceOwnershipWithFee() external',
  'function depositReserve(uint256 amount) external',
  'function releaseEmission() external',
  'function burnUnusedPool(uint256 amount) external',
  'function fundRewardPool(uint256 amount) external',
  'function setRewardRate(uint256 newRate) external',
  'function setReferralRewardRate(uint256 newRate) external',
  'function setAnnualEmission(uint256 annualEmission) external',
  'function setBurnBps(uint256 burnBps) external',
  'function setTeamTargetTier(uint8 index, uint256 minTeamStaked, uint256 bonusBps) external',
  'function blockUser(address user) external',
  'function unblockUser(address user) external',
  'function pause() external',
  'function unpause() external',

  // ── View ───────────────────────────────────────────────────────────────────
  'function totalStaked() external view returns (uint256)',
  'function totalUsers() external view returns (uint256)',
  'function rewardPoolBalance() external view returns (uint256)',
  'function rewardRate() external view returns (uint256)',
  'function referralRewardRate() external view returns (uint256)',
  'function paused() external view returns (bool)',
  'function totalBurned() external view returns (uint256)',
  'function isRenounced() external view returns (bool)',
  'function feeRecipient() external view returns (address)',
  'function totalFeesCollected() external view returns (uint256)',
  'function stakeToken() external view returns (address)',
  'function rewardToken() external view returns (address)',
  'function ANNUAL_EMISSION() external view returns (uint256)',
  'function BURN_BPS() external view returns (uint256)',
  'function MAX_BURN_BPS() external view returns (uint256)',
  'function MIN_APY_BPS() external view returns (uint256)',
  'function MAX_APY_BPS() external view returns (uint256)',
  'function LOCK_PERIOD() external view returns (uint256)',
  'function getEffectiveAPY() external view returns (uint256)',
  'function getReleasableEmission() external view returns (uint256)',
  'function getRemainingYears() external view returns (uint256)',
  'function getMaxPendingRewards() external view returns (uint256)',
  'function totalReserve() external view returns (uint256)',
  'function emissionStartTime() external view returns (uint256)',
  'function totalEmissionReleased() external view returns (uint256)',
  'function totalYearlyBurned() external view returns (uint256)',
  'function lastYearBurnTime() external view returns (uint256)',
  'function getPendingReward(address user, uint256 stakeId) external view returns (uint256)',
  `function getUserStakes(address user) external view returns (
    tuple(uint256 amount, uint8 lockPeriodIndex, uint256 stakedAt, uint256 unlockAt,
          uint256 lastClaimAt, uint256 totalClaimed, bool isActive, uint256 apy)[]
  )`,
  `function users(address) external view returns (
    uint256 totalStaked, uint256 totalRewardsEarned, uint256 totalReferralRewards,
    address referrer, uint256 referralCount, bool isBlocked, bool isRegistered,
    uint256 registeredAt, uint256 stakeCount, uint256 teamSize, uint256 teamTotalStaked
  )`,
  'function getTeamBonusBps(address user) external view returns (uint256)',
  `function getTeamTierInfo(address user) external view returns (uint8 tierIndex, uint256 bonusBps, uint256 teamTotalStaked)`,
  `function teamTargetTiers(uint256 index) external view returns (uint256 minTeamStaked, uint256 bonusBps)`,
  'function getReferrals(address user) external view returns (address[])',

  // ── Events ─────────────────────────────────────────────────────────────────
  'event TokensStaked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 fee, uint256 lockPeriod, uint256 unlockAt, uint256 apy)',
  'event RewardsClaimed(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 fee, uint256 timestamp)',
  'event RewardsCompounded(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 fee, uint256 newStake, uint256 timestamp)',
  'event TokensUnstaked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 fee, uint256 timestamp)',
  'event UserRegistered(address indexed user, address indexed referrer, uint256 timestamp)',
  'event ReserveDeposited(address indexed funder, uint256 amount, uint256 totalReserve)',
  'event EmissionReleased(uint256 releasedAmount, uint256 newRewardPoolBalance, uint256 totalEmissionReleased)',
  'event UnusedPoolBurned(uint256 burnAmount, uint256 totalYearlyBurned, uint256 remainingYears)',
  'event RewardPoolFunded(address indexed funder, uint256 amount, uint256 totalPool)',
  'event RewardRateUpdated(uint256 newRate)',
  'event ReferralRateUpdated(uint256 newRate)',
  'event AnnualEmissionUpdated(uint256 newEmission)',
  'event BurnBpsUpdated(uint256 newBurnBps)',
  'event UserBlockedEvent(address indexed user)',
  'event UserUnblockedEvent(address indexed user)',
  'event TeamTargetTierUpdated(uint8 indexed tierIndex, uint256 minTeamStaked, uint256 bonusBps)',
  'event TeamBonusApplied(address indexed user, uint256 indexed stakeId, uint256 bonusAmount)',
  'event TokensBurned(address indexed user, uint256 indexed stakeId, uint256 burnAmount, uint256 totalBurned)',
  'event OwnershipRenounced(address indexed formerOwner, uint256 timestamp)',
  'event RenounceFeeCollected(address indexed recipient, address indexed claimant, uint256 feeAmount, uint256 totalFeesCollected)',
] as const;

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function transfer(address to, uint256 amount) external returns (bool)',
] as const;
