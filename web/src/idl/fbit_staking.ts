export type FbitStaking = {
  "version": "0.1.0",
  "name": "fbit_staking",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "rewardTokenMint", "isMut": false, "isSigner": false },
        { "name": "stakeTokenMint", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "rent", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "rewardRate", "type": "u64" },
        { "name": "referralRewardRate", "type": "u64" }
      ]
    },
    {
      "name": "fundRewardPool",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "funderTokenAccount", "isMut": true, "isSigner": false },
        { "name": "rewardVault", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "registerUser",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "referrerAccount", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "referrer", "type": { "option": "publicKey" } }
      ]
    },
    {
      "name": "stake",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "stakeEntry", "isMut": true, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "stakeVault", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": true, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" },
        { "name": "lockPeriodIndex", "type": "u8" }
      ]
    },
    {
      "name": "claimRewards",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "stakeEntry", "isMut": true, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "rewardVault", "isMut": true, "isSigner": false },
        { "name": "adminRewardAccount", "isMut": true, "isSigner": false },
        { "name": "rewardTokenMint", "isMut": true, "isSigner": false },
        { "name": "feeRecipientTokenAccount", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": false, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "stakeEntryId", "type": "u64" }
      ]
    },
    {
      "name": "compoundRewards",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "stakeEntry", "isMut": true, "isSigner": false },
        { "name": "rewardVault", "isMut": true, "isSigner": false },
        { "name": "adminRewardAccount", "isMut": true, "isSigner": false },
        { "name": "rewardTokenMint", "isMut": true, "isSigner": false },
        { "name": "feeRecipientTokenAccount", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": false, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "unstake",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "stakeEntry", "isMut": true, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "stakeVault", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": false, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "setRewardRate",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "newRate", "type": "u64" }
      ]
    },
    {
      "name": "setReferralRewardRate",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "newRate", "type": "u64" }
      ]
    },
    {
      "name": "blockUser",
      "accounts": [
        { "name": "platform", "isMut": false, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "unblockUser",
      "accounts": [
        { "name": "platform", "isMut": false, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "togglePause",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "setLockPeriodApy",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "index", "type": "u8" },
        { "name": "apy", "type": "u64" }
      ]
    },
    {
      "name": "setBatchApy",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "apyValues", "type": { "array": ["u64", 7] } }
      ]
    },
    {
      "name": "setTeamTargetTier",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "index", "type": "u8" },
        { "name": "minTeamStaked", "type": "u64" },
        { "name": "bonusBps", "type": "u64" }
      ]
    },
    {
      "name": "updateUserTeamStats",
      "accounts": [
        { "name": "platform", "isMut": false, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "teamSize", "type": "u64" },
        { "name": "teamTotalStaked", "type": "u64" }
      ]
    },
    {
      "name": "renounceOwnership",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "triggerHalving",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "caller", "isMut": true, "isSigner": true }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "Platform",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "publicKey" },
          { "name": "rewardTokenMint", "type": "publicKey" },
          { "name": "stakeTokenMint", "type": "publicKey" },
          { "name": "rewardRate", "type": "u64" },
          { "name": "referralRewardRate", "type": "u64" },
          { "name": "totalStaked", "type": "u64" },
          { "name": "totalUsers", "type": "u64" },
          { "name": "rewardPoolBalance", "type": "u64" },
          { "name": "isPaused", "type": "bool" },
          { "name": "baseApy", "type": { "array": ["u64", 7] } },
          { "name": "teamTierMinStaked", "type": { "array": ["u64", 10] } },
          { "name": "teamTierBonusBps", "type": { "array": ["u64", 10] } },
          { "name": "totalBurned", "type": "u64" },
          { "name": "halvingEpoch", "type": "u64" },
          { "name": "halvingStartTime", "type": "i64" },
          { "name": "isRenounced", "type": "bool" },
          { "name": "feeRecipient", "type": "publicKey" },
          { "name": "totalFeesCollected", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "UserAccount",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "owner", "type": "publicKey" },
          { "name": "totalStaked", "type": "u64" },
          { "name": "totalRewardsEarned", "type": "u64" },
          { "name": "totalReferralRewards", "type": "u64" },
          { "name": "referrer", "type": { "option": "publicKey" } },
          { "name": "referralCount", "type": "u64" },
          { "name": "isBlocked", "type": "bool" },
          { "name": "registeredAt", "type": "i64" },
          { "name": "teamSize", "type": "u64" },
          { "name": "teamTotalStaked", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "StakeEntry",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "owner", "type": "publicKey" },
          { "name": "amount", "type": "u64" },
          { "name": "lockPeriodIndex", "type": "u8" },
          { "name": "stakedAt", "type": "i64" },
          { "name": "unlockAt", "type": "i64" },
          { "name": "lastClaimAt", "type": "i64" },
          { "name": "totalClaimed", "type": "u64" },
          { "name": "isActive", "type": "bool" },
          { "name": "apy", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "RewardPoolFunded",
      "fields": [
        { "name": "authority", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "totalPool", "type": "u64", "index": false }
      ]
    },
    {
      "name": "UserRegistered",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "referrer", "type": { "option": "publicKey" }, "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "TokensStaked",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "lockPeriod", "type": "u64", "index": false },
        { "name": "unlockAt", "type": "i64", "index": false },
        { "name": "apy", "type": "u64", "index": false }
      ]
    },
    {
      "name": "RewardsClaimed",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "RewardsCompounded",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "newStake", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "TokensUnstaked",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "ReferralReward",
      "fields": [
        { "name": "staker", "type": "publicKey", "index": false },
        { "name": "referrer", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "level", "type": "u8", "index": false }
      ]
    },
    {
      "name": "RewardRateUpdated",
      "fields": [
        { "name": "newRate", "type": "u64", "index": false }
      ]
    },
    {
      "name": "ReferralRateUpdated",
      "fields": [
        { "name": "newRate", "type": "u64", "index": false }
      ]
    },
    {
      "name": "UserBlocked",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false }
      ]
    },
    {
      "name": "UserUnblocked",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false }
      ]
    },
    {
      "name": "PlatformPauseToggled",
      "fields": [
        { "name": "isPaused", "type": "bool", "index": false }
      ]
    },
    {
      "name": "LockPeriodAPYUpdated",
      "fields": [
        { "name": "index", "type": "u8", "index": false },
        { "name": "apy", "type": "u64", "index": false }
      ]
    },
    {
      "name": "TeamTargetTierUpdated",
      "fields": [
        { "name": "index", "type": "u8", "index": false },
        { "name": "minTeamStaked", "type": "u64", "index": false },
        { "name": "bonusBps", "type": "u64", "index": false }
      ]
    },
    {
      "name": "TeamBonusApplied",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "bonusAmount", "type": "u64", "index": false }
      ]
    },
    {
      "name": "UserTeamStatsUpdated",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "teamSize", "type": "u64", "index": false },
        { "name": "teamTotalStaked", "type": "u64", "index": false }
      ]
    },
    {
      "name": "TokensBurned",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "burnAmount", "type": "u64", "index": false },
        { "name": "totalBurned", "type": "u64", "index": false }
      ]
    },
    {
      "name": "HalvingTriggered",
      "fields": [
        { "name": "triggeredBy", "type": "publicKey", "index": false },
        { "name": "halvingEpoch", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "OwnershipRenounced",
      "fields": [
        { "name": "formerOwner", "type": "publicKey", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "RenounceFeeCollected",
      "fields": [
        { "name": "recipient", "type": "publicKey", "index": false },
        { "name": "claimant", "type": "publicKey", "index": false },
        { "name": "feeAmount", "type": "u64", "index": false },
        { "name": "totalFeesCollected", "type": "u64", "index": false }
      ]
    }
  ],
  "errors": [
    { "code": 6000, "name": "PlatformPaused", "msg": "Platform is paused" },
    { "code": 6001, "name": "Unauthorized", "msg": "Unauthorized" },
    { "code": 6002, "name": "InvalidAmount", "msg": "Invalid amount" },
    { "code": 6003, "name": "InvalidLockPeriod", "msg": "Invalid lock period" },
    { "code": 6004, "name": "LockPeriodActive", "msg": "Lock period is still active" },
    { "code": 6005, "name": "StakeNotActive", "msg": "Stake is not active" },
    { "code": 6006, "name": "NoRewardsToClaim", "msg": "No rewards to claim" },
    { "code": 6007, "name": "InsufficientRewardPool", "msg": "Insufficient reward pool" },
    { "code": 6008, "name": "ClaimTooEarly", "msg": "Claim too early - wait 24 hours" },
    { "code": 6009, "name": "UserBlocked", "msg": "User is blocked" },
    { "code": 6010, "name": "OverflowError", "msg": "Overflow error" },
    { "code": 6011, "name": "InvalidAdminAccount", "msg": "Invalid admin fee account" },
    { "code": 6012, "name": "InvalidMint", "msg": "Invalid token mint" },
    { "code": 6013, "name": "InvalidTierIndex", "msg": "Invalid tier index (0-9)" },
    { "code": 6014, "name": "TeamBonusTooHigh", "msg": "Team bonus BPS exceeds maximum" },
    { "code": 6015, "name": "HalvingNotDue", "msg": "Halving interval has not elapsed yet" },
    { "code": 6016, "name": "AlreadyRenounced", "msg": "Ownership has already been renounced" },
    { "code": 6017, "name": "InvalidFeeRecipient", "msg": "Fee recipient token account does not match" }
  ]
};

export const IDL: FbitStaking = {
  "version": "0.1.0",
  "name": "fbit_staking",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "rewardTokenMint", "isMut": false, "isSigner": false },
        { "name": "stakeTokenMint", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "rent", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "rewardRate", "type": "u64" },
        { "name": "referralRewardRate", "type": "u64" }
      ]
    },
    {
      "name": "fundRewardPool",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "funderTokenAccount", "isMut": true, "isSigner": false },
        { "name": "rewardVault", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "registerUser",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "referrerAccount", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "referrer", "type": { "option": "publicKey" } }
      ]
    },
    {
      "name": "stake",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "stakeEntry", "isMut": true, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "stakeVault", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": true, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" },
        { "name": "lockPeriodIndex", "type": "u8" }
      ]
    },
    {
      "name": "claimRewards",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "stakeEntry", "isMut": true, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "rewardVault", "isMut": true, "isSigner": false },
        { "name": "adminRewardAccount", "isMut": true, "isSigner": false },
        { "name": "rewardTokenMint", "isMut": true, "isSigner": false },
        { "name": "feeRecipientTokenAccount", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": false, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "stakeEntryId", "type": "u64" }
      ]
    },
    {
      "name": "compoundRewards",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "stakeEntry", "isMut": true, "isSigner": false },
        { "name": "rewardVault", "isMut": true, "isSigner": false },
        { "name": "adminRewardAccount", "isMut": true, "isSigner": false },
        { "name": "rewardTokenMint", "isMut": true, "isSigner": false },
        { "name": "feeRecipientTokenAccount", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": false, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "unstake",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "stakeEntry", "isMut": true, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "stakeVault", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": false, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "setRewardRate",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "newRate", "type": "u64" }
      ]
    },
    {
      "name": "setReferralRewardRate",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "newRate", "type": "u64" }
      ]
    },
    {
      "name": "blockUser",
      "accounts": [
        { "name": "platform", "isMut": false, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "unblockUser",
      "accounts": [
        { "name": "platform", "isMut": false, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "togglePause",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "setLockPeriodApy",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "index", "type": "u8" },
        { "name": "apy", "type": "u64" }
      ]
    },
    {
      "name": "setBatchApy",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "apyValues", "type": { "array": ["u64", 7] } }
      ]
    },
    {
      "name": "setTeamTargetTier",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "index", "type": "u8" },
        { "name": "minTeamStaked", "type": "u64" },
        { "name": "bonusBps", "type": "u64" }
      ]
    },
    {
      "name": "updateUserTeamStats",
      "accounts": [
        { "name": "platform", "isMut": false, "isSigner": false },
        { "name": "userAccount", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": [
        { "name": "teamSize", "type": "u64" },
        { "name": "teamTotalStaked", "type": "u64" }
      ]
    },
    {
      "name": "renounceOwnership",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "authority", "isMut": false, "isSigner": true }
      ],
      "args": []
    },
    {
      "name": "triggerHalving",
      "accounts": [
        { "name": "platform", "isMut": true, "isSigner": false },
        { "name": "caller", "isMut": true, "isSigner": true }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "Platform",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "publicKey" },
          { "name": "rewardTokenMint", "type": "publicKey" },
          { "name": "stakeTokenMint", "type": "publicKey" },
          { "name": "rewardRate", "type": "u64" },
          { "name": "referralRewardRate", "type": "u64" },
          { "name": "totalStaked", "type": "u64" },
          { "name": "totalUsers", "type": "u64" },
          { "name": "rewardPoolBalance", "type": "u64" },
          { "name": "isPaused", "type": "bool" },
          { "name": "baseApy", "type": { "array": ["u64", 7] } },
          { "name": "teamTierMinStaked", "type": { "array": ["u64", 10] } },
          { "name": "teamTierBonusBps", "type": { "array": ["u64", 10] } },
          { "name": "totalBurned", "type": "u64" },
          { "name": "halvingEpoch", "type": "u64" },
          { "name": "halvingStartTime", "type": "i64" },
          { "name": "isRenounced", "type": "bool" },
          { "name": "feeRecipient", "type": "publicKey" },
          { "name": "totalFeesCollected", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "UserAccount",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "owner", "type": "publicKey" },
          { "name": "totalStaked", "type": "u64" },
          { "name": "totalRewardsEarned", "type": "u64" },
          { "name": "totalReferralRewards", "type": "u64" },
          { "name": "referrer", "type": { "option": "publicKey" } },
          { "name": "referralCount", "type": "u64" },
          { "name": "isBlocked", "type": "bool" },
          { "name": "registeredAt", "type": "i64" },
          { "name": "teamSize", "type": "u64" },
          { "name": "teamTotalStaked", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "StakeEntry",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "owner", "type": "publicKey" },
          { "name": "amount", "type": "u64" },
          { "name": "lockPeriodIndex", "type": "u8" },
          { "name": "stakedAt", "type": "i64" },
          { "name": "unlockAt", "type": "i64" },
          { "name": "lastClaimAt", "type": "i64" },
          { "name": "totalClaimed", "type": "u64" },
          { "name": "isActive", "type": "bool" },
          { "name": "apy", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "RewardPoolFunded",
      "fields": [
        { "name": "authority", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "totalPool", "type": "u64", "index": false }
      ]
    },
    {
      "name": "UserRegistered",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "referrer", "type": { "option": "publicKey" }, "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "TokensStaked",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "lockPeriod", "type": "u64", "index": false },
        { "name": "unlockAt", "type": "i64", "index": false },
        { "name": "apy", "type": "u64", "index": false }
      ]
    },
    {
      "name": "RewardsClaimed",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "RewardsCompounded",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "newStake", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "TokensUnstaked",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "ReferralReward",
      "fields": [
        { "name": "staker", "type": "publicKey", "index": false },
        { "name": "referrer", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "level", "type": "u8", "index": false }
      ]
    },
    {
      "name": "RewardRateUpdated",
      "fields": [
        { "name": "newRate", "type": "u64", "index": false }
      ]
    },
    {
      "name": "ReferralRateUpdated",
      "fields": [
        { "name": "newRate", "type": "u64", "index": false }
      ]
    },
    {
      "name": "UserBlocked",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false }
      ]
    },
    {
      "name": "UserUnblocked",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false }
      ]
    },
    {
      "name": "PlatformPauseToggled",
      "fields": [
        { "name": "isPaused", "type": "bool", "index": false }
      ]
    },
    {
      "name": "LockPeriodAPYUpdated",
      "fields": [
        { "name": "index", "type": "u8", "index": false },
        { "name": "apy", "type": "u64", "index": false }
      ]
    },
    {
      "name": "TeamTargetTierUpdated",
      "fields": [
        { "name": "index", "type": "u8", "index": false },
        { "name": "minTeamStaked", "type": "u64", "index": false },
        { "name": "bonusBps", "type": "u64", "index": false }
      ]
    },
    {
      "name": "TeamBonusApplied",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "bonusAmount", "type": "u64", "index": false }
      ]
    },
    {
      "name": "UserTeamStatsUpdated",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "teamSize", "type": "u64", "index": false },
        { "name": "teamTotalStaked", "type": "u64", "index": false }
      ]
    },
    {
      "name": "TokensBurned",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "burnAmount", "type": "u64", "index": false },
        { "name": "totalBurned", "type": "u64", "index": false }
      ]
    },
    {
      "name": "HalvingTriggered",
      "fields": [
        { "name": "triggeredBy", "type": "publicKey", "index": false },
        { "name": "halvingEpoch", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "OwnershipRenounced",
      "fields": [
        { "name": "formerOwner", "type": "publicKey", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "RenounceFeeCollected",
      "fields": [
        { "name": "recipient", "type": "publicKey", "index": false },
        { "name": "claimant", "type": "publicKey", "index": false },
        { "name": "feeAmount", "type": "u64", "index": false },
        { "name": "totalFeesCollected", "type": "u64", "index": false }
      ]
    }
  ],
  "errors": [
    { "code": 6000, "name": "PlatformPaused", "msg": "Platform is paused" },
    { "code": 6001, "name": "Unauthorized", "msg": "Unauthorized" },
    { "code": 6002, "name": "InvalidAmount", "msg": "Invalid amount" },
    { "code": 6003, "name": "InvalidLockPeriod", "msg": "Invalid lock period" },
    { "code": 6004, "name": "LockPeriodActive", "msg": "Lock period is still active" },
    { "code": 6005, "name": "StakeNotActive", "msg": "Stake is not active" },
    { "code": 6006, "name": "NoRewardsToClaim", "msg": "No rewards to claim" },
    { "code": 6007, "name": "InsufficientRewardPool", "msg": "Insufficient reward pool" },
    { "code": 6008, "name": "ClaimTooEarly", "msg": "Claim too early - wait 24 hours" },
    { "code": 6009, "name": "UserBlocked", "msg": "User is blocked" },
    { "code": 6010, "name": "OverflowError", "msg": "Overflow error" },
    { "code": 6011, "name": "InvalidAdminAccount", "msg": "Invalid admin fee account" },
    { "code": 6012, "name": "InvalidMint", "msg": "Invalid token mint" },
    { "code": 6013, "name": "InvalidTierIndex", "msg": "Invalid tier index (0-9)" },
    { "code": 6014, "name": "TeamBonusTooHigh", "msg": "Team bonus BPS exceeds maximum" },
    { "code": 6015, "name": "HalvingNotDue", "msg": "Halving interval has not elapsed yet" },
    { "code": 6016, "name": "AlreadyRenounced", "msg": "Ownership has already been renounced" },
    { "code": 6017, "name": "InvalidFeeRecipient", "msg": "Fee recipient token account does not match" }
  ]
};
