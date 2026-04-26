/**
 * Solana FBiT Staking Anchor IDL
 * Generated from contracts/solana/target/idl/idl.json
 */
export const IDL = {
  version: '0.1.0',
  name: 'fbit_staking',
  instructions: [
    {
      name: 'initialize',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'authority', isMut: true, isSigner: true },
        { name: 'rewardTokenMint', isMut: false, isSigner: false },
        { name: 'stakeTokenMint', isMut: false, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
        { name: 'rent', isMut: false, isSigner: false },
      ],
      args: [
        { name: 'rewardRate', type: 'u64' },
        { name: 'referralRewardRate', type: 'u64' },
      ],
    },
    {
      name: 'fundRewardPool',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'authority', isMut: true, isSigner: true },
        { name: 'funderTokenAccount', isMut: true, isSigner: false },
        { name: 'rewardVault', isMut: true, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'registerUser',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'userAccount', isMut: true, isSigner: false },
        { name: 'referrerAccount', isMut: true, isSigner: false },
        { name: 'owner', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'referrer', type: { option: 'publicKey' } }],
    },
    {
      name: 'stake',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'userAccount', isMut: true, isSigner: false },
        { name: 'stakeEntry', isMut: true, isSigner: false },
        { name: 'userTokenAccount', isMut: true, isSigner: false },
        { name: 'stakeVault', isMut: true, isSigner: false },
        { name: 'adminStakeAccount', isMut: true, isSigner: false },
        { name: 'rewardVault', isMut: true, isSigner: false },
        { name: 'owner', isMut: true, isSigner: true },
        { name: 'tokenProgram', isMut: false, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [
        { name: 'amount', type: 'u64' },
        { name: 'lockPeriodIndex', type: 'u8' },
      ],
    },
    {
      name: 'claimRewards',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'userAccount', isMut: true, isSigner: false },
        { name: 'stakeEntry', isMut: true, isSigner: false },
        { name: 'userTokenAccount', isMut: true, isSigner: false },
        { name: 'rewardVault', isMut: true, isSigner: false },
        { name: 'owner', isMut: false, isSigner: true },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'stakeEntryId', type: 'u64' }],
    },
    {
      name: 'compoundRewards',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'userAccount', isMut: true, isSigner: false },
        { name: 'stakeEntry', isMut: true, isSigner: false },
        { name: 'owner', isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: 'unstake',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'userAccount', isMut: true, isSigner: false },
        { name: 'stakeEntry', isMut: true, isSigner: false },
        { name: 'userTokenAccount', isMut: true, isSigner: false },
        { name: 'stakeVault', isMut: true, isSigner: false },
        { name: 'owner', isMut: false, isSigner: true },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'setRewardRate',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'authority', isMut: false, isSigner: true },
      ],
      args: [{ name: 'newRate', type: 'u64' }],
    },
    {
      name: 'setReferralRewardRate',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'authority', isMut: false, isSigner: true },
      ],
      args: [{ name: 'newRate', type: 'u64' }],
    },
    {
      name: 'blockUser',
      accounts: [
        { name: 'platform', isMut: false, isSigner: false },
        { name: 'userAccount', isMut: true, isSigner: false },
        { name: 'authority', isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: 'unblockUser',
      accounts: [
        { name: 'platform', isMut: false, isSigner: false },
        { name: 'userAccount', isMut: true, isSigner: false },
        { name: 'authority', isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: 'togglePause',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'authority', isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: 'setLockPeriodApy',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'authority', isMut: false, isSigner: true },
      ],
      args: [
        { name: 'index', type: 'u8' },
        { name: 'apy', type: 'u64' },
      ],
    },
    {
      name: 'setBatchApy',
      accounts: [
        { name: 'platform', isMut: true, isSigner: false },
        { name: 'authority', isMut: false, isSigner: true },
      ],
      args: [{ name: 'apyValues', type: { array: ['u64', 7] } }],
    },
  ],
  accounts: [
    {
      name: 'Platform',
      type: {
        kind: 'struct',
        fields: [
          { name: 'authority', type: 'publicKey' },
          { name: 'rewardTokenMint', type: 'publicKey' },
          { name: 'stakeTokenMint', type: 'publicKey' },
          { name: 'rewardRate', type: 'u64' },
          { name: 'referralRewardRate', type: 'u64' },
          { name: 'totalStaked', type: 'u64' },
          { name: 'totalUsers', type: 'u64' },
          { name: 'rewardPoolBalance', type: 'u64' },
          { name: 'isPaused', type: 'bool' },
          { name: 'baseApy', type: { array: ['u64', 7] } },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      name: 'UserAccount',
      type: {
        kind: 'struct',
        fields: [
          { name: 'owner', type: 'publicKey' },
          { name: 'totalStaked', type: 'u64' },
          { name: 'totalRewardsEarned', type: 'u64' },
          { name: 'totalReferralRewards', type: 'u64' },
          { name: 'referrer', type: { option: 'publicKey' } },
          { name: 'referralCount', type: 'u64' },
          { name: 'isBlocked', type: 'bool' },
          { name: 'registeredAt', type: 'i64' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      name: 'StakeEntry',
      type: {
        kind: 'struct',
        fields: [
          { name: 'owner', type: 'publicKey' },
          { name: 'amount', type: 'u64' },
          { name: 'lockPeriodIndex', type: 'u8' },
          { name: 'stakedAt', type: 'i64' },
          { name: 'unlockAt', type: 'i64' },
          { name: 'lastClaimAt', type: 'i64' },
          { name: 'totalClaimed', type: 'u64' },
          { name: 'isActive', type: 'bool' },
          { name: 'apy', type: 'u64' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: 'PlatformPaused', msg: 'Platform is paused' },
    { code: 6001, name: 'Unauthorized', msg: 'Unauthorized' },
    { code: 6002, name: 'InvalidAmount', msg: 'Invalid amount' },
    { code: 6003, name: 'InvalidLockPeriod', msg: 'Invalid lock period' },
    { code: 6004, name: 'LockPeriodActive', msg: 'Lock period is still active' },
    { code: 6005, name: 'StakeNotActive', msg: 'Stake is not active' },
    { code: 6006, name: 'NoRewardsToClaim', msg: 'No rewards to claim' },
    { code: 6007, name: 'InsufficientRewardPool', msg: 'Insufficient reward pool' },
    { code: 6008, name: 'ClaimTooEarly', msg: 'Claim too early - wait 12 hours' },
    { code: 6009, name: 'UserBlocked', msg: 'User is blocked' },
    { code: 6010, name: 'OverflowError', msg: 'Overflow error' },
  ],
} as const;
