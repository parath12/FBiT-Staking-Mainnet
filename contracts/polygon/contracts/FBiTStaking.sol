// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title FBiTStaking
 * @notice Staking + 10-level referral + 10-level Team Target Bonus
 *         + 10% Reward Burn System
 *         + Proof-of-Stake APY (60 %–500 %, self-adjusting)
 *
 * Fee schedule
 *  • Stake / Unstake / Claim / Compound : 1 % → owner
 *
 * Burn System
 *  • Every claim / compound burns 10 % of the user's gross reward
 *  • The burn is deducted from the user's share — NOT an extra pool deduction
 *  • User receives 90 %, dead address receives 10 %
 *  • Burned tokens are sent to the dead address permanently
 *
 * PoS APY
 *  • effectiveAPY = clamp(ANNUAL_EMISSION × BASIS_POINTS / totalStaked, MIN_APY_BPS, MAX_APY_BPS)
 *  • MIN_APY_BPS =  6 000 (60 %)    MAX_APY_BPS = 50 000 (500 %)
 *  • ANNUAL_EMISSION is the total FBiT tokens the pool distributes per year.
 *    As more users stake, each one's share shrinks — APY falls automatically.
 *    As users unstake, APY rises automatically. No manual intervention needed.
 *  • Admin may call setAnnualEmission() before renouncing ownership.
 *
 * Team Target Bonus
 *  • Applied on top of staking rewards at claim / compound
 *  • Based on total FBiT staked by the user's downline (up to 10 referral levels)
 *  • 10 tiers: 2 % (50 K tokens) → 10 % (1 billion tokens)
 */
contract FBiTStaking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // CONSTANTS
    // =========================================================================

    uint256 public constant MAX_REFERRAL_LEVELS = 10;
    uint256 public constant SECONDS_PER_DAY     = 86400;
    uint256 public constant CLAIM_INTERVAL      = 43200;   // 12 hours
    uint256 public constant BASIS_POINTS        = 10_000;
    uint256 public constant PLATFORM_FEE_BPS    = 100;     // 1 %
    /// @notice APY floor: 60 % in basis points
    uint256 public constant MIN_APY_BPS         = 6_000;
    /// @notice APY ceiling: 500 % in basis points
    uint256 public constant MAX_APY_BPS         = 50_000;
    /// @notice Maximum allowed burn percentage: 50 %
    uint256 public constant MAX_BURN_BPS        = 5000;
    /// @dev 25 % of gross reward sent to feeRecipient after ownership renouncement
    uint256 public constant RENOUNCE_FEE_BPS    = 2500;

    /// @dev Dead address — tokens sent here are permanently removed from circulation
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256[10] public REFERRAL_PERCENTAGES = [25, 50, 125, 150, 200, 325, 350, 425, 550, 800];

    /// @notice Single lock period: 30 days.
    uint256 public constant LOCK_PERIOD = 30;

    // =========================================================================
    // STATE — PoS APY
    // =========================================================================

    /**
     * @notice Burn percentage applied on every claim / compound (basis points).
     *         10 % of user's gross reward is burned from their share.
     *         Adjustable by owner. Range: 0 – MAX_BURN_BPS (50 %).
     */
    uint256 public BURN_BPS = 1000;

    /**
     * @notice Annual token emission used to derive the PoS APY.
     *         effectiveAPY (bps) = clamp(ANNUAL_EMISSION × BASIS_POINTS / totalStaked,
     *                                    MIN_APY_BPS, MAX_APY_BPS)
     *         Adjustable by owner before renouncement.
     */
    uint256 public ANNUAL_EMISSION;

    // =========================================================================
    // STRUCTS
    // =========================================================================

    struct TeamTargetTier {
        uint256 minTeamStaked;
        uint256 bonusBps;
    }

    struct UserInfo {
        uint256 totalStaked;
        uint256 totalRewardsEarned;
        uint256 totalReferralRewards;
        address referrer;
        uint256 referralCount;
        bool    isBlocked;
        bool    isRegistered;
        uint256 registeredAt;
        uint256 stakeCount;
        uint256 teamSize;
        uint256 teamTotalStaked;
    }

    struct StakeEntry {
        uint256 amount;
        uint8   lockPeriodIndex;
        uint256 stakedAt;
        uint256 unlockAt;
        uint256 lastClaimAt;
        uint256 totalClaimed;
        bool    isActive;
        uint256 apy; // effectiveAPY at stake time — stored for UI display only
    }

    // =========================================================================
    // STATE
    // =========================================================================

    IERC20 public stakeToken;
    IERC20 public rewardToken;

    uint256 public rewardRate;
    uint256 public referralRewardRate;
    uint256 public totalStaked;
    uint256 public totalUsers;
    uint256 public rewardPoolBalance;

    // ── Auto-Emission Reserve ─────────────────────────────────────────────────
    /**
     * @notice Tokens deposited into the long-term reserve (not yet released to rewardPoolBalance).
     *         Fund this ONCE with the full supply (e.g. 800 M FBiT).
     *         The contract releases ANNUAL_EMISSION tokens per year automatically.
     */
    uint256 public totalReserve;

    /**
     * @notice Unix timestamp when the first reserve deposit was made.
     *         Emission clock starts from this moment.
     */
    uint256 public emissionStartTime;

    /**
     * @notice Cumulative emission already moved from reserve → rewardPoolBalance.
     */
    uint256 public totalEmissionReleased;

    // ── Year-End Burn tracking ────────────────────────────────────────────────
    /**
     * @notice Cumulative tokens burned via year-end unused-pool burns.
     *         Each burn reduces the effective emission cap, shortening the 800-year schedule.
     */
    uint256 public totalYearlyBurned;

    /**
     * @notice Timestamp of the last year-end burn (initialised to emissionStartTime).
     *         Used to enforce one burn per year.
     */
    uint256 public lastYearBurnTime;

    // ── Burn tracking ─────────────────────────────────────────────────────────
    uint256 public totalBurned;

    // ── Ownership renouncement + passive fee ──────────────────────────────────
    bool    public isRenounced;
    address public feeRecipient;
    uint256 public totalFeesCollected;

    TeamTargetTier[10] public teamTargetTiers;

    mapping(address => UserInfo)                        public users;
    mapping(address => mapping(uint256 => StakeEntry))  public stakes;
    mapping(address => address[])                       public referrals;
    mapping(address => address)                         public referralChain;

    // =========================================================================
    // EVENTS
    // =========================================================================

    event ReserveDeposited(address indexed funder, uint256 amount, uint256 totalReserve);
    event EmissionReleased(uint256 releasedAmount, uint256 newRewardPoolBalance, uint256 totalEmissionReleased);
    event UnusedPoolBurned(uint256 burnAmount, uint256 totalYearlyBurned, uint256 remainingYears);
    event RewardPoolFunded(address indexed funder, uint256 amount, uint256 totalPool);
    event UserRegistered(address indexed user, address indexed referrer, uint256 timestamp);
    event TokensStaked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 fee, uint256 lockPeriod, uint256 unlockAt, uint256 apy);
    event RewardsClaimed(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 fee, uint256 timestamp);
    event RewardsCompounded(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 fee, uint256 newStake, uint256 timestamp);
    event TokensUnstaked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 fee, uint256 timestamp);
    event ReferralReward(address indexed staker, address indexed referrer, uint256 amount, uint8 level);
    event RewardRateUpdated(uint256 newRate);
    event ReferralRateUpdated(uint256 newRate);
    event AnnualEmissionUpdated(uint256 newEmission);
    event BurnBpsUpdated(uint256 newBurnBps);
    event UserBlockedEvent(address indexed user);
    event UserUnblockedEvent(address indexed user);
    event TeamTargetTierUpdated(uint8 indexed tierIndex, uint256 minTeamStaked, uint256 bonusBps);
    event TeamBonusApplied(address indexed user, uint256 indexed stakeId, uint256 bonusAmount);
    event OwnershipRenounced(address indexed formerOwner, uint256 timestamp);
    event RenounceFeeCollected(
        address indexed recipient,
        address indexed claimant,
        uint256         feeAmount,
        uint256         totalFeesCollected
    );
    event TokensBurned(
        address indexed user,
        uint256 indexed stakeId,
        uint256 burnAmount,
        uint256 totalBurned
    );

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(
        address _stakeToken,
        address _rewardToken,
        uint256 _rewardRate,
        uint256 _referralRewardRate,
        uint256 _annualEmission
    ) Ownable(msg.sender) {
        require(_stakeToken    != address(0), "Zero stake token");
        require(_rewardToken   != address(0), "Zero reward token");
        require(_annualEmission >  0,         "Zero annual emission");
        stakeToken         = IERC20(_stakeToken);
        rewardToken        = IERC20(_rewardToken);
        rewardRate         = _rewardRate;
        referralRewardRate = _referralRewardRate;
        ANNUAL_EMISSION    = _annualEmission;

        uint256 d = 10 ** 6;
        teamTargetTiers[0] = TeamTargetTier({ minTeamStaked: 50_000 * d,         bonusBps: 200  });
        teamTargetTiers[1] = TeamTargetTier({ minTeamStaked: 150_000 * d,        bonusBps: 300  });
        teamTargetTiers[2] = TeamTargetTier({ minTeamStaked: 500_000 * d,        bonusBps: 400  });
        teamTargetTiers[3] = TeamTargetTier({ minTeamStaked: 1_000_000 * d,      bonusBps: 500  });
        teamTargetTiers[4] = TeamTargetTier({ minTeamStaked: 5_000_000 * d,      bonusBps: 600  });
        teamTargetTiers[5] = TeamTargetTier({ minTeamStaked: 10_000_000 * d,     bonusBps: 700  });
        teamTargetTiers[6] = TeamTargetTier({ minTeamStaked: 50_000_000 * d,     bonusBps: 750  });
        teamTargetTiers[7] = TeamTargetTier({ minTeamStaked: 100_000_000 * d,    bonusBps: 850  });
        teamTargetTiers[8] = TeamTargetTier({ minTeamStaked: 500_000_000 * d,    bonusBps: 900  });
        teamTargetTiers[9] = TeamTargetTier({ minTeamStaked: 1_000_000_000 * d,  bonusBps: 1000 });
    }

    // =========================================================================
    // STAKING — PUBLIC
    // =========================================================================

    function registerUser(address _referrer) external whenNotPaused {
        require(!users[msg.sender].isRegistered, "Already registered");
        require(_referrer != msg.sender, "Cannot refer self");

        users[msg.sender].isRegistered = true;
        users[msg.sender].registeredAt = block.timestamp;

        if (_referrer != address(0) && users[_referrer].isRegistered) {
            users[msg.sender].referrer = _referrer;
            referralChain[msg.sender]  = _referrer;
            users[_referrer].referralCount++;
            referrals[_referrer].push(msg.sender);

            address cur = _referrer;
            for (uint8 i = 0; i < MAX_REFERRAL_LEVELS; i++) {
                if (cur == address(0)) break;
                users[cur].teamSize++;
                cur = referralChain[cur];
            }
        }

        totalUsers++;
        emit UserRegistered(msg.sender, _referrer, block.timestamp);
    }

    function stake(uint256 _amount) external nonReentrant whenNotPaused {
        require(users[msg.sender].isRegistered, "Not registered");
        require(!users[msg.sender].isBlocked,   "User is blocked");
        require(_amount > 0,                    "Invalid amount");

        uint256 fee         = isRenounced ? 0 : (_amount * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 stakeAmount = _amount - fee;

        if (fee > 0) stakeToken.safeTransferFrom(msg.sender, owner(), fee);
        stakeToken.safeTransferFrom(msg.sender, address(this), stakeAmount);

        uint256 unlockAt        = block.timestamp + LOCK_PERIOD * SECONDS_PER_DAY;
        uint256 stakeId         = users[msg.sender].stakeCount;
        uint256 currentApy      = getEffectiveAPY();

        stakes[msg.sender][stakeId] = StakeEntry({
            amount:          stakeAmount,
            lockPeriodIndex: 0,
            stakedAt:        block.timestamp,
            unlockAt:        unlockAt,
            lastClaimAt:     block.timestamp,
            totalClaimed:    0,
            isActive:        true,
            apy:             currentApy
        });

        users[msg.sender].totalStaked += stakeAmount;
        users[msg.sender].stakeCount++;
        totalStaked += stakeAmount;

        _addTeamStake(msg.sender, stakeAmount);
        _processReferralRewards(msg.sender, stakeAmount);

        emit TokensStaked(msg.sender, stakeId, stakeAmount, fee, LOCK_PERIOD, unlockAt, currentApy);
    }

    /**
     * @notice Claim staking rewards.
     *         10 % of the gross reward is burned from the user's share.
     *         User receives 90 %. Pool provides only totalGross — no extra burn deduction.
     */
    function claimRewards(uint256 _stakeId) external nonReentrant whenNotPaused {
        require(!users[msg.sender].isBlocked, "User is blocked");
        StakeEntry storage entry = stakes[msg.sender][_stakeId];
        require(entry.isActive, "Stake not active");
        require(block.timestamp - entry.lastClaimAt >= CLAIM_INTERVAL, "Claim too early (12h)");

        uint256 grossReward = _calculateReward(entry);
        require(grossReward > 0, "No rewards to claim");

        // Release any available reserve emission now — before pool balance check
        releaseEmission();

        uint256 teamBonusBps = _getTeamBonusBps(msg.sender);
        uint256 teamBonus    = (grossReward * teamBonusBps) / BASIS_POINTS;
        uint256 totalGross   = grossReward + teamBonus;

        uint256 fee      = isRenounced ? 0 : (totalGross * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 afterFee = totalGross - fee;

        // 10 % burned from user's share — pool does NOT provide extra for this
        uint256 burnAmount = (afterFee * BURN_BPS) / BASIS_POINTS;
        uint256 userReward = afterFee - burnAmount; // 90 %

        uint256 renounceFee = isRenounced ? (totalGross * RENOUNCE_FEE_BPS) / BASIS_POINTS : 0;

        // Pool provides: totalGross + renounceFee only
        uint256 totalRequired = totalGross + renounceFee;
        require(rewardPoolBalance >= totalRequired, "Insufficient reward pool");

        entry.lastClaimAt                    = block.timestamp;
        entry.totalClaimed                  += userReward;
        users[msg.sender].totalRewardsEarned += userReward;
        rewardPoolBalance                   -= totalRequired;
        totalBurned                         += burnAmount;

        if (!isRenounced && fee > 0) rewardToken.safeTransfer(owner(), fee);
        rewardToken.safeTransfer(DEAD, burnAmount);
        rewardToken.safeTransfer(msg.sender, userReward);
        if (isRenounced && renounceFee > 0) {
            totalFeesCollected += renounceFee;
            rewardToken.safeTransfer(feeRecipient, renounceFee);
            emit RenounceFeeCollected(feeRecipient, msg.sender, renounceFee, totalFeesCollected);
        }

        if (teamBonus > 0) emit TeamBonusApplied(msg.sender, _stakeId, teamBonus);
        emit TokensBurned(msg.sender, _stakeId, burnAmount, totalBurned);
        emit RewardsClaimed(msg.sender, _stakeId, userReward, fee, block.timestamp);
    }

    /**
     * @notice Compound staking rewards back into the stake.
     *         10 % of the gross reward is burned from the user's share.
     *         90 % is added to the stake. Pool provides only totalGross — no extra burn deduction.
     */
    function compoundRewards(uint256 _stakeId) external nonReentrant whenNotPaused {
        require(!users[msg.sender].isBlocked, "User is blocked");
        StakeEntry storage entry = stakes[msg.sender][_stakeId];
        require(entry.isActive, "Stake not active");
        require(block.timestamp - entry.lastClaimAt >= CLAIM_INTERVAL, "Compound too early (12h)");

        uint256 grossReward = _calculateReward(entry);
        require(grossReward > 0, "No rewards to compound");

        // Release any available reserve emission now — before pool balance check
        releaseEmission();

        uint256 teamBonusBps = _getTeamBonusBps(msg.sender);
        uint256 teamBonus    = (grossReward * teamBonusBps) / BASIS_POINTS;
        uint256 totalGross   = grossReward + teamBonus;

        uint256 fee      = isRenounced ? 0 : (totalGross * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 afterFee = totalGross - fee;

        // 10 % burned from user's share — pool does NOT provide extra for this
        uint256 burnAmount     = (afterFee * BURN_BPS) / BASIS_POINTS;
        uint256 compoundAmount = afterFee - burnAmount; // 90 % added to stake

        uint256 renounceFee = isRenounced ? (totalGross * RENOUNCE_FEE_BPS) / BASIS_POINTS : 0;

        // Pool provides: totalGross + renounceFee only
        uint256 totalRequired = totalGross + renounceFee;
        require(rewardPoolBalance >= totalRequired, "Insufficient reward pool");

        rewardPoolBalance -= totalRequired;
        totalBurned       += burnAmount;

        if (!isRenounced && fee > 0) rewardToken.safeTransfer(owner(), fee);
        rewardToken.safeTransfer(DEAD, burnAmount);
        if (isRenounced && renounceFee > 0) {
            totalFeesCollected += renounceFee;
            rewardToken.safeTransfer(feeRecipient, renounceFee);
            emit RenounceFeeCollected(feeRecipient, msg.sender, renounceFee, totalFeesCollected);
        }

        entry.amount     += compoundAmount;
        entry.lastClaimAt = block.timestamp;
        users[msg.sender].totalStaked        += compoundAmount;
        users[msg.sender].totalRewardsEarned += compoundAmount;
        totalStaked += compoundAmount;

        _addTeamStake(msg.sender, compoundAmount);

        if (teamBonus > 0) emit TeamBonusApplied(msg.sender, _stakeId, teamBonus);
        emit TokensBurned(msg.sender, _stakeId, burnAmount, totalBurned);
        emit RewardsCompounded(msg.sender, _stakeId, compoundAmount, fee, entry.amount, block.timestamp);
    }

    function unstake(uint256 _stakeId) external nonReentrant whenNotPaused {
        StakeEntry storage entry = stakes[msg.sender][_stakeId];
        require(entry.isActive,                    "Stake not active");
        require(block.timestamp >= entry.unlockAt, "Lock period active");

        uint256 amount     = entry.amount;
        uint256 fee        = isRenounced ? 0 : (amount * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 userAmount = amount - fee;

        entry.isActive = false;
        users[msg.sender].totalStaked -= amount;
        totalStaked                   -= amount;

        _removeTeamStake(msg.sender, amount);

        if (fee > 0) stakeToken.safeTransfer(owner(), fee);
        stakeToken.safeTransfer(msg.sender, userAmount);

        emit TokensUnstaked(msg.sender, _stakeId, userAmount, fee, block.timestamp);
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function renounceOwnershipWithFee() external onlyOwner {
        require(!isRenounced, "Already renounced");
        feeRecipient = msg.sender;
        isRenounced  = true;
        _transferOwnership(address(0));
        emit OwnershipRenounced(feeRecipient, block.timestamp);
    }

    /**
     * @notice Deposit the FULL token supply into the reserve once.
     *         Tokens are released linearly at ANNUAL_EMISSION per year automatically —
     *         no manual pool-funding ever needed again.
     *         Can be called multiple times to top up the reserve.
     * @param _amount Amount in token units (with decimals).
     */
    function depositReserve(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Zero amount");
        require(!isRenounced, "Ownership renounced - deposit before renouncing");
        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
        if (emissionStartTime == 0) {
            emissionStartTime = block.timestamp;
            lastYearBurnTime  = block.timestamp; // year clock starts here
        }
        totalReserve += _amount;
        emit ReserveDeposited(msg.sender, _amount, totalReserve);
    }

    /**
     * @notice Calculate how many tokens from the reserve can be released right now.
     * @return Amount that can be moved to rewardPoolBalance.
     */
    function getReleasableEmission() public view returns (uint256) {
        if (emissionStartTime == 0) return 0;
        uint256 originalDeposit = totalReserve + totalEmissionReleased;
        if (originalDeposit == 0) return 0;
        // Year-end burns reduce the effective emission cap, shortening the schedule
        uint256 effectiveMax = originalDeposit > totalYearlyBurned
            ? originalDeposit - totalYearlyBurned
            : 0;
        if (effectiveMax == 0) return 0;
        uint256 elapsed  = block.timestamp - emissionStartTime;
        uint256 totalDue = (ANNUAL_EMISSION * elapsed) / 365 days;
        if (totalDue > effectiveMax) totalDue = effectiveMax;
        if (totalDue <= totalEmissionReleased) return 0;
        uint256 releasable = totalDue - totalEmissionReleased;
        if (releasable > totalReserve) releasable = totalReserve;
        return releasable;
    }

    /**
     * @notice Returns estimated years of emission remaining based on current reserve and yearly burns.
     */
    function getRemainingYears() public view returns (uint256) {
        if (ANNUAL_EMISSION == 0) return 0;
        uint256 originalDeposit = totalReserve + totalEmissionReleased;
        uint256 effectiveMax = originalDeposit > totalYearlyBurned
            ? originalDeposit - totalYearlyBurned
            : 0;
        if (effectiveMax <= totalEmissionReleased) return 0;
        return (effectiveMax - totalEmissionReleased) / ANNUAL_EMISSION;
    }

    /**
     * @notice Returns the maximum pending reward the pool may owe to ALL active stakers
     *         right now (conservative upper-bound estimate, not per-stake exact).
     *         The year-end auto-burn and manual burnUnusedPool() will never burn below this floor.
     */
    function getMaxPendingRewards() public view returns (uint256) {
        return _maxPendingRewards();
    }

    /**
     * @notice Release releasable emission from reserve into the reward pool.
     *         Callable by anyone. Also called automatically inside claimRewards / compoundRewards.
     *
     *         AUTO YEAR-END BURN: if a new year has started since the last burn, any surplus
     *         in the reward pool (above what active stakers may still claim) is burned
     *         automatically BEFORE this year's new emission is added.
     *         User-earned pending rewards are NEVER burned — only the genuine surplus is.
     *         No admin action required — the first claim/compound of each new year triggers the burn.
     */
    function releaseEmission() public {
        // ── Auto year-end burn ────────────────────────────────────────────────
        if (lastYearBurnTime > 0 && block.timestamp >= lastYearBurnTime + 365 days) {
            uint256 yearsPassed = (block.timestamp - lastYearBurnTime) / 365 days;

            // Compute max pending BEFORE advancing the year clock (uses lastYearBurnTime as ref)
            uint256 maxPending = _maxPendingRewards();

            lastYearBurnTime += yearsPassed * 365 days;

            if (rewardPoolBalance > maxPending) {
                uint256 burnAmount = rewardPoolBalance - maxPending;
                rewardPoolBalance -= burnAmount;   // state change before external call
                totalBurned       += burnAmount;
                totalYearlyBurned += burnAmount;
                rewardToken.safeTransfer(DEAD, burnAmount);
                emit UnusedPoolBurned(burnAmount, totalYearlyBurned, getRemainingYears());
            }
        }

        // ── Release new emission ──────────────────────────────────────────────
        uint256 releasable = getReleasableEmission();
        if (releasable == 0) return;
        totalEmissionReleased += releasable;
        totalReserve          -= releasable;
        rewardPoolBalance     += releasable;
        emit EmissionReleased(releasable, rewardPoolBalance, totalEmissionReleased);
    }

    /**
     * @notice Emergency manual burn of the SURPLUS pool balance only.
     *         Automatically protects all pending user rewards — you cannot burn
     *         more than the genuine surplus (pool − maxPendingRewards).
     * @param _amount Amount to burn. Capped at the burnable surplus.
     */
    function burnUnusedPool(uint256 _amount) external onlyOwner {
        require(_amount > 0,          "Zero burn amount");
        require(emissionStartTime > 0, "Reserve not started");

        uint256 maxPending = _maxPendingRewards();
        uint256 burnable   = rewardPoolBalance > maxPending
            ? rewardPoolBalance - maxPending
            : 0;
        require(burnable > 0, "No burnable surplus - pool is fully reserved for user rewards");
        if (_amount > burnable) _amount = burnable;

        rewardPoolBalance -= _amount;
        totalBurned       += _amount;
        totalYearlyBurned += _amount;

        rewardToken.safeTransfer(DEAD, _amount);
        emit UnusedPoolBurned(_amount, totalYearlyBurned, getRemainingYears());
    }

    function fundRewardPool(uint256 _amount) external onlyOwner {
        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
        rewardPoolBalance += _amount;
        emit RewardPoolFunded(msg.sender, _amount, rewardPoolBalance);
    }

    function setRewardRate(uint256 _newRate) external onlyOwner {
        rewardRate = _newRate;
        emit RewardRateUpdated(_newRate);
    }

    function setReferralRewardRate(uint256 _newRate) external onlyOwner {
        referralRewardRate = _newRate;
        emit ReferralRateUpdated(_newRate);
    }

    /**
     * @notice Update the annual emission that governs PoS APY.
     *         Higher emission → higher APY at the same total staked.
     *         Lower emission  → lower APY.
     *         APY is always clamped between MIN_APY_BPS (60%) and MAX_APY_BPS (500%).
     */
    /**
     * @notice Update the burn percentage applied on every claim / compound.
     * @param _burnBps Burn in basis points. 0 = no burn, 1000 = 10 %, max 5000 = 50 %.
     */
    function setBurnBps(uint256 _burnBps) external onlyOwner {
        require(_burnBps <= MAX_BURN_BPS, "Burn exceeds 50% maximum");
        BURN_BPS = _burnBps;
        emit BurnBpsUpdated(_burnBps);
    }

    function setAnnualEmission(uint256 _annualEmission) external onlyOwner {
        require(_annualEmission > 0, "Zero emission");
        // Cap at 10× the default (1B tokens/year) to prevent accidental over-emission
        require(_annualEmission <= 1_000_000_000 * 10 ** 6, "Emission too high");
        ANNUAL_EMISSION = _annualEmission;
        emit AnnualEmissionUpdated(_annualEmission);
    }

    function blockUser(address _user) external onlyOwner {
        users[_user].isBlocked = true;
        emit UserBlockedEvent(_user);
    }

    function unblockUser(address _user) external onlyOwner {
        users[_user].isBlocked = false;
        emit UserUnblockedEvent(_user);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function emergencyWithdraw(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyOwner whenPaused {
        require(_to != address(0), "Zero recipient");
        uint256 bal = IERC20(_token).balanceOf(address(this));
        uint256 amt = (_amount > bal) ? bal : _amount;
        require(amt > 0, "Nothing to withdraw");
        if (_token == address(rewardToken)) {
            if (amt <= rewardPoolBalance) {
                rewardPoolBalance -= amt;
            } else {
                uint256 fromPool    = rewardPoolBalance;
                uint256 fromReserve = amt - fromPool;
                rewardPoolBalance   = 0;
                totalReserve        = fromReserve <= totalReserve ? totalReserve - fromReserve : 0;
            }
        }
        IERC20(_token).safeTransfer(_to, amt);
    }

    function setTeamTargetTier(
        uint8   _index,
        uint256 _minTeamStaked,
        uint256 _bonusBps
    ) external onlyOwner {
        require(_index < 10,        "Invalid tier index (0-9)");
        require(_bonusBps <= 1000,  "Bonus exceeds 10 % maximum");
        if (_index > 0) {
            require(
                _minTeamStaked > teamTargetTiers[_index - 1].minTeamStaked,
                "Threshold must exceed previous tier"
            );
        }
        if (_index < 9) {
            require(
                teamTargetTiers[_index + 1].minTeamStaked == 0 ||
                _minTeamStaked < teamTargetTiers[_index + 1].minTeamStaked,
                "Threshold must be below next tier"
            );
        }
        teamTargetTiers[_index] = TeamTargetTier({ minTeamStaked: _minTeamStaked, bonusBps: _bonusBps });
        emit TeamTargetTierUpdated(_index, _minTeamStaked, _bonusBps);
    }

    // =========================================================================
    // VIEW
    // =========================================================================

    /**
     * @notice Returns the current effective APY in basis points.
     *         Formula: clamp(ANNUAL_EMISSION × BASIS_POINTS / totalStaked,
     *                        MIN_APY_BPS, MAX_APY_BPS)
     *         When nobody is staking yet, returns MAX_APY_BPS (500 %).
     */
    function getEffectiveAPY() public view returns (uint256) {
        if (totalStaked == 0) return MAX_APY_BPS;
        uint256 apy = (ANNUAL_EMISSION * BASIS_POINTS) / totalStaked;
        if (apy > MAX_APY_BPS) return MAX_APY_BPS;
        if (apy < MIN_APY_BPS) return MIN_APY_BPS;
        return apy;
    }

    function getPendingReward(address _user, uint256 _stakeId) external view returns (uint256) {
        StakeEntry storage entry = stakes[_user][_stakeId];
        if (!entry.isActive) return 0;
        return _calculateReward(entry);
    }

    function getUserStakes(address _user) external view returns (StakeEntry[] memory) {
        uint256 count = users[_user].stakeCount;
        StakeEntry[] memory out = new StakeEntry[](count);
        for (uint256 i = 0; i < count; i++) out[i] = stakes[_user][i];
        return out;
    }

    function getReferrals(address _user) external view returns (address[] memory) {
        return referrals[_user];
    }

    function getReferralChain(address _user) external view returns (address[10] memory chain) {
        address cur = _user;
        for (uint256 i = 0; i < MAX_REFERRAL_LEVELS; i++) {
            cur = referralChain[cur];
            if (cur == address(0)) break;
            chain[i] = cur;
        }
    }

    function getTeamBonusBps(address _user) external view returns (uint256) {
        return _getTeamBonusBps(_user);
    }

    function getTeamTierInfo(address _user)
        external view
        returns (uint8 tierIndex, uint256 bonusBps, uint256 teamTotalStaked_)
    {
        teamTotalStaked_ = users[_user].teamTotalStaked;
        bonusBps  = 0;
        tierIndex = 0;
        for (uint8 i = 9; ; i--) {
            if (teamTotalStaked_ >= teamTargetTiers[i].minTeamStaked
                    && teamTargetTiers[i].minTeamStaked > 0) {
                tierIndex = i + 1;
                bonusBps  = teamTargetTiers[i].bonusBps;
                break;
            }
            if (i == 0) break;
        }
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    /**
     * @dev Conservative upper-bound of rewards the pool currently owes all active stakers.
     *      Uses totalStaked as if every token has been earning since lastYearBurnTime (year start).
     *      This over-estimates slightly (some stakers joined mid-year or already claimed),
     *      making the protection conservative — we protect a bit MORE than the true owed amount.
     *      Cap at 730 intervals = one full year of 12-hour intervals.
     */
    function _maxPendingRewards() internal view returns (uint256) {
        if (totalStaked == 0) return 0;
        uint256 refTime = lastYearBurnTime > 0 ? lastYearBurnTime : emissionStartTime;
        if (refTime == 0 || block.timestamp <= refTime) return 0;
        uint256 elapsed      = block.timestamp - refTime;
        uint256 maxIntervals = elapsed / CLAIM_INTERVAL;
        if (maxIntervals == 0) return 0;
        if (maxIntervals > 730) maxIntervals = 730;
        uint256 effectiveApy = getEffectiveAPY();
        return (totalStaked * effectiveApy * maxIntervals) / (730 * BASIS_POINTS);
    }

    /**
     * @dev Calculates reward using live PoS APY (based on current totalStaked).
     *      APY auto-adjusts: more stakers → lower APY, fewer stakers → higher APY.
     *      Always clamped between MIN_APY_BPS (60 %) and MAX_APY_BPS (500 %).
     */
    function _calculateReward(StakeEntry storage entry) internal view returns (uint256) {
        uint256 elapsed   = block.timestamp - entry.lastClaimAt;
        uint256 intervals = elapsed / CLAIM_INTERVAL;
        if (intervals == 0) return 0;

        uint256 effectiveApy = getEffectiveAPY();
        return (entry.amount * effectiveApy * intervals) / (730 * BASIS_POINTS);
    }

    function _getTeamBonusBps(address _user) internal view returns (uint256) {
        uint256 teamStaked = users[_user].teamTotalStaked;
        for (uint8 i = 9; ; i--) {
            if (teamStaked >= teamTargetTiers[i].minTeamStaked
                    && teamTargetTiers[i].minTeamStaked > 0) {
                return teamTargetTiers[i].bonusBps;
            }
            if (i == 0) break;
        }
        return 0;
    }

    function _addTeamStake(address _staker, uint256 _amount) internal {
        address cur = referralChain[_staker];
        for (uint8 i = 0; i < MAX_REFERRAL_LEVELS; i++) {
            if (cur == address(0)) break;
            users[cur].teamTotalStaked += _amount;
            cur = referralChain[cur];
        }
    }

    function _removeTeamStake(address _staker, uint256 _amount) internal {
        address cur = referralChain[_staker];
        for (uint8 i = 0; i < MAX_REFERRAL_LEVELS; i++) {
            if (cur == address(0)) break;
            if (users[cur].teamTotalStaked >= _amount) {
                users[cur].teamTotalStaked -= _amount;
            } else {
                users[cur].teamTotalStaked = 0;
            }
            cur = referralChain[cur];
        }
    }

    function _processReferralRewards(address _staker, uint256 _amount) internal {
        address cur = referralChain[_staker];
        for (uint8 i = 0; i < MAX_REFERRAL_LEVELS; i++) {
            if (cur == address(0)) break;
            if (!users[cur].isBlocked) {
                uint256 reward = (_amount * REFERRAL_PERCENTAGES[i]) / BASIS_POINTS;
                if (reward > 0 && rewardPoolBalance >= reward) {
                    users[cur].totalReferralRewards += reward;
                    rewardPoolBalance               -= reward;
                    rewardToken.safeTransfer(cur, reward);
                    emit ReferralReward(_staker, cur, reward, i);
                }
            }
            cur = referralChain[cur];
        }
    }
}
