use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint, Burn};

declare_id!("8AYv6AAqYxHzLxARsFRsqGSbhDuEmbnsGoLExpdcP4pp");

// ===== CONSTANTS =====
pub const MAX_REFERRAL_LEVELS: usize = 10;
pub const REFERRAL_PERCENTAGES: [u64; 10] = [25, 50, 125, 150, 200, 325, 350, 425, 550, 800];
pub const SECONDS_PER_DAY: i64 = 86400;
pub const CLAIM_INTERVAL: i64 = 43200;           // 12 hours
pub const LOCK_PERIODS: [u64; 7] = [30, 90, 180, 365, 730, 1825, 3650];
pub const DEFAULT_APY: [u64; 7] = [800, 1200, 1800, 2500, 3500, 5000, 7500];
pub const PLATFORM_FEE_BPS:  u64 = 100;    // 1%
pub const BURN_BPS:          u64 = 1000;   // 10% burn on every claim/compound
pub const RENOUNCE_FEE_BPS:  u64 = 2500;  // 25% of gross reward to feeRecipient after renouncement
pub const MAX_APY_BPS:       u64 = 50_000; // 500% max APY (safety ceiling)

// Default team target tier thresholds (6 decimals = multiply by 10^6)
// Tier 1: 50K tokens → 2%  …  Tier 10: 1B tokens → 10%
pub const DEFAULT_TEAM_MIN_STAKED: [u64; 10] = [
    50_000_u64        * 1_000_000,   //   50 K
    150_000_u64       * 1_000_000,   //  150 K
    500_000_u64       * 1_000_000,   //  500 K
    1_000_000_u64     * 1_000_000,   //    1 M
    5_000_000_u64     * 1_000_000,   //    5 M
    10_000_000_u64    * 1_000_000,   //   10 M
    50_000_000_u64    * 1_000_000,   //   50 M
    100_000_000_u64   * 1_000_000,   //  100 M
    500_000_000_u64   * 1_000_000,   //  500 M
    1_000_000_000_u64 * 1_000_000,   //    1 B
];
pub const DEFAULT_TEAM_BONUS_BPS: [u64; 10] = [200, 300, 400, 500, 600, 700, 750, 850, 900, 1000];

// ===== HELPER =====

/// Returns the bonus BPS for a user based on their stored team_total_staked.
fn get_team_bonus_bps(platform: &Platform, user_account: &UserAccount) -> u64 {
    let team_staked = user_account.team_total_staked;
    let mut i = 9usize;
    loop {
        if platform.team_tier_min_staked[i] > 0 && team_staked >= platform.team_tier_min_staked[i] {
            return platform.team_tier_bonus_bps[i];
        }
        if i == 0 { break; }
        i -= 1;
    }
    0
}

// ===== PROGRAM =====

#[program]
pub mod fbit_staking {
    use super::*;

    // ─────────────────────────────────────────────────────────────────────────────
    // PLATFORM
    // ─────────────────────────────────────────────────────────────────────────────

    pub fn initialize(ctx: Context<Initialize>, reward_rate: u64, referral_reward_rate: u64) -> Result<()> {
        let p = &mut ctx.accounts.platform;
        p.authority            = ctx.accounts.authority.key();
        p.reward_token_mint    = ctx.accounts.reward_token_mint.key();
        p.stake_token_mint     = ctx.accounts.stake_token_mint.key();
        p.reward_rate          = reward_rate;
        p.referral_reward_rate = referral_reward_rate;
        p.total_staked         = 0;
        p.total_users          = 0;
        p.reward_pool_balance  = 0;
        p.is_paused            = false;
        p.base_apy             = DEFAULT_APY;
        // Team Target Bonus tiers
        p.team_tier_min_staked = DEFAULT_TEAM_MIN_STAKED;
        p.team_tier_bonus_bps  = DEFAULT_TEAM_BONUS_BPS;
        p.bump                 = ctx.bumps.platform;
        p.total_burned         = 0;
        p.halving_epoch        = 0;
        p.halving_start_time   = Clock::get()?.unix_timestamp;
        // Renouncement (inactive at launch)
        p.is_renounced         = false;
        p.fee_recipient        = Pubkey::default();
        p.total_fees_collected = 0;
        Ok(())
    }

    pub fn fund_reward_pool(ctx: Context<FundRewardPool>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.platform.is_paused, StakingError::PlatformPaused);
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);

        token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
            from:      ctx.accounts.funder_token_account.to_account_info(),
            to:        ctx.accounts.reward_vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        }), amount)?;

        ctx.accounts.platform.reward_pool_balance =
            ctx.accounts.platform.reward_pool_balance.checked_add(amount).unwrap();

        emit!(RewardPoolFunded {
            authority: ctx.accounts.authority.key(), amount,
            total_pool: ctx.accounts.platform.reward_pool_balance,
        });
        Ok(())
    }

    pub fn register_user(ctx: Context<RegisterUser>, referrer: Option<Pubkey>) -> Result<()> {
        require!(!ctx.accounts.platform.is_paused, StakingError::PlatformPaused);
        // Prevent self-referral
        if let Some(ref_key) = referrer {
            require!(ref_key != ctx.accounts.owner.key(), StakingError::SelfReferral);
            // Verify the supplied referrer_account PDA belongs to the stated referrer pubkey
            require!(
                ctx.accounts.referrer_account.owner == ref_key,
                StakingError::ReferrerMismatch
            );
        }

        let user = &mut ctx.accounts.user_account;
        user.owner                  = ctx.accounts.owner.key();
        user.total_staked           = 0;
        user.total_rewards_earned   = 0;
        user.total_referral_rewards = 0;
        user.referrer               = referrer;
        user.referral_count         = 0;
        user.is_blocked             = false;
        user.registered_at          = Clock::get()?.unix_timestamp;
        user.team_size              = 0;
        user.team_total_staked      = 0;
        user.stake_count            = 0;
        user.bump                   = ctx.bumps.user_account;

        if referrer.is_some() && ctx.accounts.referrer_account.owner != Pubkey::default() {
            ctx.accounts.referrer_account.referral_count =
                ctx.accounts.referrer_account.referral_count.checked_add(1).unwrap();
            // team_size of the direct referrer is incremented; deeper levels updated via
            // update_user_team_stats (admin/crank) after on-chain events are indexed
            ctx.accounts.referrer_account.team_size =
                ctx.accounts.referrer_account.team_size.checked_add(1).unwrap();
        }
        ctx.accounts.platform.total_users =
            ctx.accounts.platform.total_users.checked_add(1).unwrap();

        emit!(UserRegistered { user: ctx.accounts.owner.key(), referrer, timestamp: Clock::get()?.unix_timestamp });
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STAKING  (1 % platform fee on every operation)
    // ─────────────────────────────────────────────────────────────────────────────

    pub fn stake<'info>(ctx: Context<'_, '_, '_, 'info, Stake<'info>>, amount: u64, lock_period_index: u8) -> Result<()> {
        require!(!ctx.accounts.platform.is_paused, StakingError::PlatformPaused);
        require!(!ctx.accounts.user_account.is_blocked, StakingError::UserBlocked);
        require!(amount > 0, StakingError::InvalidAmount);
        require!((lock_period_index as usize) < 7, StakingError::InvalidLockPeriod);

        let now        = Clock::get()?.unix_timestamp;
        let lock_days  = LOCK_PERIODS[lock_period_index as usize];
        let unlock_at  = now + (lock_days as i64 * SECONDS_PER_DAY);
        let apy        = ctx.accounts.platform.base_apy[lock_period_index as usize];
        let referrer   = ctx.accounts.user_account.referrer;
        let ref_rate   = ctx.accounts.platform.referral_reward_rate;

        // When renounced, authority == Pubkey::default(): skip the 1 % stake fee
        let fee           = if ctx.accounts.platform.is_renounced { 0 }
                            else { amount.checked_mul(PLATFORM_FEE_BPS).unwrap().checked_div(10_000).unwrap() };
        let staked_amount = amount.checked_sub(fee).unwrap();

        let tp = ctx.accounts.token_program.to_account_info();
        let user_ta = ctx.accounts.user_token_account.to_account_info();
        let owner_ai = ctx.accounts.owner.to_account_info();

        if fee > 0 {
            token::transfer(CpiContext::new(tp.clone(), Transfer {
                from: user_ta.clone(), to: ctx.accounts.admin_stake_account.to_account_info(), authority: owner_ai.clone(),
            }), fee)?;
        }
        token::transfer(CpiContext::new(tp, Transfer {
            from: user_ta, to: ctx.accounts.stake_vault.to_account_info(), authority: owner_ai,
        }), staked_amount)?;

        let se = &mut ctx.accounts.stake_entry;
        se.owner             = ctx.accounts.owner.key();
        se.amount            = staked_amount;
        se.lock_period_index = lock_period_index;
        se.staked_at         = now;
        se.unlock_at         = unlock_at;
        se.last_claim_at     = now;
        se.total_claimed     = 0;
        se.is_active         = true;
        se.apy               = apy;
        se.stake_id          = ctx.accounts.user_account.stake_count;
        se.bump              = ctx.bumps.stake_entry;

        ctx.accounts.user_account.total_staked =
            ctx.accounts.user_account.total_staked.checked_add(staked_amount).unwrap();
        // Update this user's team_total_staked (will also be updated by admin crank for ancestors)
        ctx.accounts.user_account.team_total_staked =
            ctx.accounts.user_account.team_total_staked.checked_add(staked_amount).unwrap();
        ctx.accounts.platform.total_staked =
            ctx.accounts.platform.total_staked.checked_add(staked_amount).unwrap();
        ctx.accounts.user_account.stake_count =
            ctx.accounts.user_account.stake_count.checked_add(1).unwrap();

        // ── 10-level referral rewards via remaining_accounts ─────────────────────
        // remaining_accounts layout: pairs of [UserAccount PDA (mut), reward ATA (mut)]
        // pair index 0 = Level 1 (direct referrer), index 1 = Level 2, …, index 9 = Level 10.
        if !ctx.remaining_accounts.is_empty() && ref_rate > 0 {
            let remaining        = ctx.remaining_accounts;
            let mut cur_referrer = ctx.accounts.user_account.referrer;
            let bump             = ctx.accounts.platform.bump;
            let seeds            = &[b"platform".as_ref(), &[bump]];
            let signer           = &[&seeds[..]];
            // Pre-extract these so they share the same 'info lifetime as remaining_accounts.
            let reward_vault_ai  = ctx.accounts.reward_vault.to_account_info();
            let token_program_ai = ctx.accounts.token_program.to_account_info();
            let platform_ai      = ctx.accounts.platform.to_account_info();

            for level in 0..MAX_REFERRAL_LEVELS {
                let pair_start = level * 2;
                if pair_start + 1 >= remaining.len() { break; }
                let Some(expected_key) = cur_referrer else { break; };

                let ref_user_ai   = &remaining[pair_start];
                let ref_reward_ai = &remaining[pair_start + 1];

                // Deserialize referrer's UserAccount to read owner/blocked/next-referrer.
                let (user_owner, is_blocked, next_ref): (Pubkey, bool, Option<Pubkey>) = {
                    let data = ref_user_ai.try_borrow_data()
                        .map_err(|_| error!(StakingError::Unauthorized))?;
                    let mut slice: &[u8] = &data[8..]; // skip 8-byte discriminator
                    match UserAccount::deserialize(&mut slice) {
                        Ok(u) => (u.owner, u.is_blocked, u.referrer),
                        Err(_) => break, // not a valid UserAccount — stop chain
                    }
                };

                // Always advance regardless of whether we pay this level
                cur_referrer = next_ref;

                if user_owner != expected_key { continue; }

                let level_bps  = REFERRAL_PERCENTAGES[level];
                let ref_reward = staked_amount.checked_mul(level_bps).unwrap().checked_div(10_000).unwrap();

                if is_blocked || ref_reward == 0 || ctx.accounts.platform.reward_pool_balance < ref_reward {
                    continue;
                }

                // Transfer reward_vault → referrer's reward ATA
                token::transfer(CpiContext::new_with_signer(
                    token_program_ai.clone(),
                    Transfer {
                        from:      reward_vault_ai.clone(),
                        to:        ref_reward_ai.clone(),
                        authority: platform_ai.clone(),
                    },
                    signer,
                ), ref_reward)?;

                // Update total_referral_rewards in the UserAccount on-chain
                {
                    let mut data = ref_user_ai.try_borrow_mut_data()
                        .map_err(|_| error!(StakingError::Unauthorized))?;
                    let mut updated = {
                        let mut slice: &[u8] = &data[8..];
                        UserAccount::deserialize(&mut slice)
                            .map_err(|_| error!(StakingError::Unauthorized))?
                    };
                    updated.total_referral_rewards = updated.total_referral_rewards
                        .checked_add(ref_reward).unwrap();
                    updated.serialize(&mut &mut data[8..])
                        .map_err(|_| error!(StakingError::Unauthorized))?;
                }

                ctx.accounts.platform.reward_pool_balance =
                    ctx.accounts.platform.reward_pool_balance.checked_sub(ref_reward).unwrap();

                emit!(ReferralReward {
                    staker:   ctx.accounts.owner.key(),
                    referrer: expected_key,
                    amount:   ref_reward,
                    level:    level as u8,
                });
            }
        }
        emit!(TokensStaked { user: ctx.accounts.owner.key(), amount: staked_amount, fee, lock_period: lock_days, unlock_at, apy });
        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>, _stake_entry_id: u64) -> Result<()> {
        require!(!ctx.accounts.platform.is_paused, StakingError::PlatformPaused);
        require!(!ctx.accounts.user_account.is_blocked, StakingError::UserBlocked);
        require!(ctx.accounts.stake_entry.is_active, StakingError::StakeNotActive);

        let now     = Clock::get()?.unix_timestamp;
        let elapsed = now - ctx.accounts.stake_entry.last_claim_at;
        require!(elapsed >= CLAIM_INTERVAL, StakingError::ClaimTooEarly);

        let intervals    = elapsed as u64 / CLAIM_INTERVAL as u64;
        let gross_reward = ctx.accounts.stake_entry.amount
            .checked_mul(ctx.accounts.stake_entry.apy).unwrap()
            .checked_mul(intervals).unwrap()
            .checked_div(730 * 10_000).unwrap();

        require!(gross_reward > 0, StakingError::NoRewardsToClaim);

        // ── Team Target Bonus ──
        let team_bonus_bps = get_team_bonus_bps(&ctx.accounts.platform, &ctx.accounts.user_account);
        let team_bonus     = gross_reward.checked_mul(team_bonus_bps).unwrap().checked_div(10_000).unwrap();
        let total_gross    = gross_reward.checked_add(team_bonus).unwrap();

        // When renounced, skip 1% platform fee; pay 25% passive fee to fee_recipient instead
        let fee         = if ctx.accounts.platform.is_renounced { 0 }
                          else { total_gross.checked_mul(PLATFORM_FEE_BPS).unwrap().checked_div(10_000).unwrap() };
        let after_fee   = total_gross.checked_sub(fee).unwrap();
        let burn_amount = after_fee.checked_mul(BURN_BPS).unwrap().checked_div(10_000).unwrap(); // 10% burned
        let user_reward = after_fee.checked_sub(burn_amount).unwrap(); // 90% to user

        // Passive renounce fee: 25% of total_gross, drawn additionally from the pool
        let renounce_fee = if ctx.accounts.platform.is_renounced {
            total_gross.checked_mul(RENOUNCE_FEE_BPS).unwrap().checked_div(10_000).unwrap()
        } else { 0 };

        // Pool must cover: total_gross + renounce_fee (burn is within after_fee)
        let total_required = total_gross.checked_add(renounce_fee).unwrap();
        require!(ctx.accounts.platform.reward_pool_balance >= total_required, StakingError::InsufficientRewardPool);

        let bump    = ctx.accounts.platform.bump;
        let seeds   = &[b"platform".as_ref(), &[bump]];
        let signer  = &[&seeds[..]];
        let tp      = ctx.accounts.token_program.to_account_info();
        let vault   = ctx.accounts.reward_vault.to_account_info();
        let plat_ai = ctx.accounts.platform.to_account_info();

        if !ctx.accounts.platform.is_renounced && fee > 0 {
            token::transfer(CpiContext::new_with_signer(tp.clone(), Transfer {
                from: vault.clone(), to: ctx.accounts.admin_reward_account.to_account_info(), authority: plat_ai.clone(),
            }, signer), fee)?;
        }
        token::transfer(CpiContext::new_with_signer(tp.clone(), Transfer {
            from: vault.clone(), to: ctx.accounts.user_token_account.to_account_info(), authority: plat_ai.clone(),
        }, signer), user_reward)?;

        // Burn 1:1 equivalent from the reward vault
        token::burn(CpiContext::new_with_signer(tp.clone(), Burn {
            mint:      ctx.accounts.reward_token_mint.to_account_info(),
            from:      vault.clone(),
            authority: plat_ai.clone(),
        }, signer), burn_amount)?;

        // Passive renounce fee — transfer directly to fee_recipient's token account
        if ctx.accounts.platform.is_renounced && renounce_fee > 0 {
            require!(
                ctx.accounts.fee_recipient_token_account.owner == ctx.accounts.platform.fee_recipient,
                StakingError::InvalidFeeRecipient
            );
            token::transfer(CpiContext::new_with_signer(tp, Transfer {
                from:      vault,
                to:        ctx.accounts.fee_recipient_token_account.to_account_info(),
                authority: plat_ai,
            }, signer), renounce_fee)?;
            ctx.accounts.platform.total_fees_collected =
                ctx.accounts.platform.total_fees_collected.checked_add(renounce_fee).unwrap();
            emit!(RenounceFeeCollected {
                recipient:           ctx.accounts.platform.fee_recipient,
                claimant:            ctx.accounts.owner.key(),
                fee_amount:          renounce_fee,
                total_fees_collected: ctx.accounts.platform.total_fees_collected,
            });
        }

        ctx.accounts.stake_entry.last_claim_at = now;
        ctx.accounts.stake_entry.total_claimed =
            ctx.accounts.stake_entry.total_claimed.checked_add(user_reward).unwrap();
        ctx.accounts.user_account.total_rewards_earned =
            ctx.accounts.user_account.total_rewards_earned.checked_add(user_reward).unwrap();
        ctx.accounts.platform.reward_pool_balance =
            ctx.accounts.platform.reward_pool_balance.checked_sub(total_required).unwrap();
        ctx.accounts.platform.total_burned =
            ctx.accounts.platform.total_burned.checked_add(burn_amount).unwrap();

        if team_bonus > 0 {
            emit!(TeamBonusApplied { user: ctx.accounts.owner.key(), bonus_amount: team_bonus });
        }
        emit!(TokensBurned { user: ctx.accounts.owner.key(), burn_amount, total_burned: ctx.accounts.platform.total_burned });
        emit!(RewardsClaimed { user: ctx.accounts.owner.key(), amount: user_reward, fee, timestamp: now });
        Ok(())
    }

    pub fn compound_rewards(ctx: Context<CompoundRewards>) -> Result<()> {
        require!(!ctx.accounts.platform.is_paused, StakingError::PlatformPaused);
        require!(!ctx.accounts.user_account.is_blocked, StakingError::UserBlocked);
        require!(ctx.accounts.stake_entry.is_active, StakingError::StakeNotActive);

        let now     = Clock::get()?.unix_timestamp;
        let elapsed = now - ctx.accounts.stake_entry.last_claim_at;
        require!(elapsed >= CLAIM_INTERVAL, StakingError::ClaimTooEarly);

        let intervals    = elapsed as u64 / CLAIM_INTERVAL as u64;
        let gross_reward = ctx.accounts.stake_entry.amount
            .checked_mul(ctx.accounts.stake_entry.apy).unwrap()
            .checked_mul(intervals).unwrap()
            .checked_div(730 * 10_000).unwrap();

        require!(gross_reward > 0, StakingError::NoRewardsToClaim);

        // ── Team Target Bonus ──
        let team_bonus_bps = get_team_bonus_bps(&ctx.accounts.platform, &ctx.accounts.user_account);
        let team_bonus     = gross_reward.checked_mul(team_bonus_bps).unwrap().checked_div(10_000).unwrap();
        let total_gross    = gross_reward.checked_add(team_bonus).unwrap();

        // When renounced, skip 1% platform fee; pay 25% passive fee to fee_recipient instead
        let fee             = if ctx.accounts.platform.is_renounced { 0 }
                              else { total_gross.checked_mul(PLATFORM_FEE_BPS).unwrap().checked_div(10_000).unwrap() };
        let after_fee       = total_gross.checked_sub(fee).unwrap();
        let burn_amount     = after_fee.checked_mul(BURN_BPS).unwrap().checked_div(10_000).unwrap(); // 10% burned
        let compound_amount = after_fee.checked_sub(burn_amount).unwrap(); // 90% compounded into stake

        // Passive renounce fee: 25% of total_gross, drawn additionally from the pool
        let renounce_fee = if ctx.accounts.platform.is_renounced {
            total_gross.checked_mul(RENOUNCE_FEE_BPS).unwrap().checked_div(10_000).unwrap()
        } else { 0 };

        // Pool must cover: total_gross + renounce_fee (burn is within after_fee)
        let total_required = total_gross.checked_add(renounce_fee).unwrap();
        require!(
            ctx.accounts.platform.reward_pool_balance >= total_required,
            StakingError::InsufficientRewardPool
        );

        let bump    = ctx.accounts.platform.bump;
        let seeds   = &[b"platform".as_ref(), &[bump]];
        let signer  = &[&seeds[..]];
        let tp      = ctx.accounts.token_program.to_account_info();
        let vault   = ctx.accounts.reward_vault.to_account_info();
        let plat_ai = ctx.accounts.platform.to_account_info();

        if !ctx.accounts.platform.is_renounced && fee > 0 {
            token::transfer(CpiContext::new_with_signer(tp.clone(), Transfer {
                from: vault.clone(), to: ctx.accounts.admin_reward_account.to_account_info(), authority: plat_ai.clone(),
            }, signer), fee)?;
        }

        // Burn 1:1 equivalent from the reward vault
        token::burn(CpiContext::new_with_signer(tp.clone(), Burn {
            mint:      ctx.accounts.reward_token_mint.to_account_info(),
            from:      vault.clone(),
            authority: plat_ai.clone(),
        }, signer), burn_amount)?;

        // Passive renounce fee — transfer directly to fee_recipient's token account
        if ctx.accounts.platform.is_renounced && renounce_fee > 0 {
            require!(
                ctx.accounts.fee_recipient_token_account.owner == ctx.accounts.platform.fee_recipient,
                StakingError::InvalidFeeRecipient
            );
            token::transfer(CpiContext::new_with_signer(tp, Transfer {
                from:      vault,
                to:        ctx.accounts.fee_recipient_token_account.to_account_info(),
                authority: plat_ai,
            }, signer), renounce_fee)?;
            ctx.accounts.platform.total_fees_collected =
                ctx.accounts.platform.total_fees_collected.checked_add(renounce_fee).unwrap();
            emit!(RenounceFeeCollected {
                recipient:           ctx.accounts.platform.fee_recipient,
                claimant:            ctx.accounts.owner.key(),
                fee_amount:          renounce_fee,
                total_fees_collected: ctx.accounts.platform.total_fees_collected,
            });
        }

        ctx.accounts.platform.reward_pool_balance =
            ctx.accounts.platform.reward_pool_balance.checked_sub(total_required).unwrap();
        ctx.accounts.platform.total_burned =
            ctx.accounts.platform.total_burned.checked_add(burn_amount).unwrap();
        ctx.accounts.platform.total_staked =
            ctx.accounts.platform.total_staked.checked_add(compound_amount).unwrap();

        ctx.accounts.stake_entry.amount =
            ctx.accounts.stake_entry.amount.checked_add(compound_amount).unwrap();
        ctx.accounts.stake_entry.last_claim_at = now;

        ctx.accounts.user_account.total_staked =
            ctx.accounts.user_account.total_staked.checked_add(compound_amount).unwrap();
        ctx.accounts.user_account.team_total_staked =
            ctx.accounts.user_account.team_total_staked.checked_add(compound_amount).unwrap();
        ctx.accounts.user_account.total_rewards_earned =
            ctx.accounts.user_account.total_rewards_earned.checked_add(compound_amount).unwrap();

        if team_bonus > 0 {
            emit!(TeamBonusApplied { user: ctx.accounts.owner.key(), bonus_amount: team_bonus });
        }
        emit!(TokensBurned { user: ctx.accounts.owner.key(), burn_amount, total_burned: ctx.accounts.platform.total_burned });
        emit!(RewardsCompounded {
            user: ctx.accounts.owner.key(), amount: compound_amount, fee,
            new_stake: ctx.accounts.stake_entry.amount, timestamp: now,
        });
        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        require!(!ctx.accounts.platform.is_paused, StakingError::PlatformPaused);
        require!(ctx.accounts.stake_entry.is_active, StakingError::StakeNotActive);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.stake_entry.unlock_at, StakingError::LockPeriodActive);

        let amount      = ctx.accounts.stake_entry.amount;
        // When renounced, skip the 1 % unstake fee
        let fee         = if ctx.accounts.platform.is_renounced { 0 }
                          else { amount.checked_mul(PLATFORM_FEE_BPS).unwrap().checked_div(10_000).unwrap() };
        let user_amount = amount.checked_sub(fee).unwrap();

        let bump    = ctx.accounts.platform.bump;
        let seeds   = &[b"platform".as_ref(), &[bump]];
        let signer  = &[&seeds[..]];
        let tp      = ctx.accounts.token_program.to_account_info();
        let vault   = ctx.accounts.stake_vault.to_account_info();
        let plat_ai = ctx.accounts.platform.to_account_info();

        if fee > 0 {
            token::transfer(CpiContext::new_with_signer(tp.clone(), Transfer {
                from: vault.clone(), to: ctx.accounts.admin_stake_account.to_account_info(), authority: plat_ai.clone(),
            }, signer), fee)?;
        }
        token::transfer(CpiContext::new_with_signer(tp, Transfer {
            from: vault, to: ctx.accounts.user_token_account.to_account_info(), authority: plat_ai,
        }, signer), user_amount)?;

        ctx.accounts.stake_entry.is_active = false;
        ctx.accounts.user_account.total_staked =
            ctx.accounts.user_account.total_staked.checked_sub(amount).unwrap();
        // Reduce own team_total_staked (ancestors updated via update_user_team_stats crank)
        ctx.accounts.user_account.team_total_staked =
            ctx.accounts.user_account.team_total_staked.saturating_sub(amount);
        ctx.accounts.platform.total_staked =
            ctx.accounts.platform.total_staked.checked_sub(amount).unwrap();

        emit!(TokensUnstaked { user: ctx.accounts.owner.key(), amount: user_amount, fee, timestamp: now });
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────────────────────────────────────

    pub fn set_reward_rate(ctx: Context<AdminAction>, new_rate: u64) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        ctx.accounts.platform.reward_rate = new_rate;
        emit!(RewardRateUpdated { new_rate });
        Ok(())
    }

    pub fn set_referral_reward_rate(ctx: Context<AdminAction>, new_rate: u64) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        ctx.accounts.platform.referral_reward_rate = new_rate;
        emit!(ReferralRateUpdated { new_rate });
        Ok(())
    }

    pub fn block_user(ctx: Context<AdminUserAction>) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        ctx.accounts.user_account.is_blocked = true;
        emit!(UserBlocked { user: ctx.accounts.user_account.owner });
        Ok(())
    }

    pub fn unblock_user(ctx: Context<AdminUserAction>) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        ctx.accounts.user_account.is_blocked = false;
        emit!(UserUnblocked { user: ctx.accounts.user_account.owner });
        Ok(())
    }

    pub fn toggle_pause(ctx: Context<AdminAction>) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        ctx.accounts.platform.is_paused = !ctx.accounts.platform.is_paused;
        emit!(PlatformPauseToggled { is_paused: ctx.accounts.platform.is_paused });
        Ok(())
    }

    pub fn set_lock_period_apy(ctx: Context<AdminAction>, index: u8, apy: u64) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        require!((index as usize) < 7, StakingError::InvalidLockPeriod);
        require!(apy <= MAX_APY_BPS, StakingError::APYTooHigh);
        ctx.accounts.platform.base_apy[index as usize] = apy;
        emit!(LockPeriodAPYUpdated { index, apy });
        Ok(())
    }

    pub fn set_batch_apy(ctx: Context<AdminAction>, apy_values: [u64; 7]) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        for apy in apy_values.iter() {
            require!(*apy <= MAX_APY_BPS, StakingError::APYTooHigh);
        }
        ctx.accounts.platform.base_apy = apy_values;
        for (i, apy) in apy_values.iter().enumerate() {
            emit!(LockPeriodAPYUpdated { index: i as u8, apy: *apy });
        }
        Ok(())
    }

    /// Update a single Team Target Bonus tier (index 0–9).
    pub fn set_team_target_tier(ctx: Context<AdminAction>, index: u8, min_team_staked: u64, bonus_bps: u64) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        require!((index as usize) < 10, StakingError::InvalidTierIndex);
        require!(bonus_bps <= 1000, StakingError::TeamBonusTooHigh);   // max 10 %
        ctx.accounts.platform.team_tier_min_staked[index as usize] = min_team_staked;
        ctx.accounts.platform.team_tier_bonus_bps[index as usize]  = bonus_bps;
        emit!(TeamTargetTierUpdated { index, min_team_staked, bonus_bps });
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // HALVING — permissionless, callable once per year by anyone
    // ─────────────────────────────────────────────────────────────────────────────

    /// Permanently renounce admin ownership in exchange for a perpetual 25 % passive fee.
    /// - The caller (current authority) becomes `fee_recipient` and loses all admin privileges.
    /// - `platform.authority` is zeroed out so all `AdminAction` checks fail going forward.
    /// - Every subsequent claim / compound sends 25 % of gross reward to `fee_recipient` from pool.
    /// - The 1 % platform fee on all operations is waived after renouncement.
    /// - Irreversible.
    pub fn renounce_ownership(ctx: Context<RenounceOwnership>) -> Result<()> {
        let p = &mut ctx.accounts.platform;
        require!(ctx.accounts.authority.key() == p.authority, StakingError::Unauthorized);
        require!(!p.is_renounced, StakingError::AlreadyRenounced);
        let former_owner = p.authority;
        p.fee_recipient  = former_owner;
        p.is_renounced   = true;
        p.authority      = Pubkey::default(); // zeroes out admin access
        emit!(OwnershipRenounced {
            former_owner,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Trigger the annual halving. Halves all base_apy values (floored at 1 BPS).
    /// New stakes created after the halving receive the reduced APY.
    /// Existing stakes keep their locked-in APY.
    pub fn trigger_halving(ctx: Context<TriggerHalving>) -> Result<()> {
        let now             = Clock::get()?.unix_timestamp;
        let halving_epoch   = ctx.accounts.platform.halving_epoch;
        let start_time      = ctx.accounts.platform.halving_start_time;
        let seconds_per_year: i64 = 365 * SECONDS_PER_DAY;
        let next_halving    = start_time + (halving_epoch as i64 + 1) * seconds_per_year;

        require!(now >= next_halving, StakingError::HalvingNotDue);

        for i in 0..7 {
            let halved = ctx.accounts.platform.base_apy[i] / 2;
            ctx.accounts.platform.base_apy[i] = if halved == 0 { 1 } else { halved };
        }

        ctx.accounts.platform.halving_epoch = halving_epoch.checked_add(1).unwrap();

        emit!(HalvingTriggered {
            triggered_by: ctx.accounts.caller.key(),
            halving_epoch: ctx.accounts.platform.halving_epoch,
            timestamp: now,
        });
        Ok(())
    }

    /// Admin / indexer crank: set a user's team_size and team_total_staked.
    /// Called after on-chain stake / unstake events are processed off-chain.
    pub fn update_user_team_stats(ctx: Context<AdminUserAction>, team_size: u64, team_total_staked: u64) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.platform.authority, StakingError::Unauthorized);
        ctx.accounts.user_account.team_size         = team_size;
        ctx.accounts.user_account.team_total_staked = team_total_staked;
        emit!(UserTeamStatsUpdated {
            user: ctx.accounts.user_account.owner,
            team_size,
            team_total_staked,
        });
        Ok(())
    }
}

// ===== ACCOUNT STRUCTS =====

#[account]
pub struct Platform {
    pub authority:            Pubkey,
    pub reward_token_mint:    Pubkey,
    pub stake_token_mint:     Pubkey,
    pub reward_rate:          u64,
    pub referral_reward_rate: u64,
    pub total_staked:         u64,
    pub total_users:          u64,
    pub reward_pool_balance:  u64,
    pub is_paused:            bool,
    pub base_apy:             [u64; 7],
    // Team Target Bonus (10 tiers)
    pub team_tier_min_staked: [u64; 10],
    pub team_tier_bonus_bps:  [u64; 10],
    pub bump:                 u8,
    // Burn system
    pub total_burned:         u64,
    // Halving system
    pub halving_epoch:        u64,
    pub halving_start_time:   i64,
    // Renouncement + passive fee
    pub is_renounced:         bool,
    pub fee_recipient:        Pubkey,
    pub total_fees_collected: u64,
}
// space: 8 + 32+32+32 + 8+8+8+8+8 + 1 + (7*8) + (10*8) + (10*8) + 1 + 8 + 8 + 8
//      = 8 + 96 + 40 + 1 + 56 + 80 + 80 + 1 + 24 = 386
// + renouncement: 1 (bool) + 32 (Pubkey) + 8 (u64) = 41
// Total = 427, use 500 for safety padding
pub const PLATFORM_SPACE: usize = 500;

#[account]
pub struct UserAccount {
    pub owner:                  Pubkey,
    pub total_staked:           u64,
    pub total_rewards_earned:   u64,
    pub total_referral_rewards: u64,
    pub referrer:               Option<Pubkey>,
    pub referral_count:         u64,
    pub is_blocked:             bool,
    pub registered_at:          i64,
    pub team_size:              u64,
    pub team_total_staked:      u64,
    pub stake_count:            u64,  // monotonic counter — used as stake PDA seed (prevents same-block collision)
    pub bump:                   u8,
}
// space: 8 + 32 + 8+8+8 + 33 + 8 + 1 + 8 + 8+8+8 + 1 = 139
pub const USER_ACCOUNT_SPACE: usize = 152;   // +13 bytes safety padding

#[account]
pub struct StakeEntry {
    pub owner:             Pubkey,
    pub amount:            u64,
    pub lock_period_index: u8,
    pub staked_at:         i64,
    pub unlock_at:         i64,
    pub last_claim_at:     i64,
    pub total_claimed:     u64,
    pub is_active:         bool,
    pub apy:               u64,
    pub stake_id:          u64,  // stored so claim/compound/unstake can re-derive the PDA seed
    pub bump:              u8,
}

// ===== CONTEXT STRUCTS =====

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = PLATFORM_SPACE, seeds = [b"platform"], bump)]
    pub platform:          Account<'info, Platform>,
    #[account(mut)]
    pub authority:         Signer<'info>,
    pub reward_token_mint: Account<'info, Mint>,
    pub stake_token_mint:  Account<'info, Mint>,
    pub system_program:    Program<'info, System>,
    pub token_program:     Program<'info, Token>,
    pub rent:              Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FundRewardPool<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform:             Account<'info, Platform>,
    #[account(mut)]
    pub authority:            Signer<'info>,
    #[account(mut,
        constraint = funder_token_account.mint == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub funder_token_account: Account<'info, TokenAccount>,
    #[account(mut,
        constraint = reward_vault.owner == platform.key() @ StakingError::InvalidVault,
        constraint = reward_vault.mint  == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub reward_vault:         Account<'info, TokenAccount>,
    pub token_program:        Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform:         Account<'info, Platform>,
    #[account(init, payer = owner, space = USER_ACCOUNT_SPACE,
        seeds = [b"user", owner.key().as_ref()], bump)]
    pub user_account:     Account<'info, UserAccount>,
    #[account(mut)]
    pub referrer_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub owner:            Signer<'info>,
    pub system_program:   Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform:           Account<'info, Platform>,
    #[account(mut, seeds = [b"user", owner.key().as_ref()], bump = user_account.bump)]
    pub user_account:       Account<'info, UserAccount>,
    #[account(init, payer = owner, space = 8+32+8+1+8+8+8+8+1+8+8+1,
        seeds = [b"stake", owner.key().as_ref(), &user_account.stake_count.to_le_bytes()], bump)]
    pub stake_entry:        Account<'info, StakeEntry>,
    #[account(mut,
        constraint = user_token_account.owner == owner.key() @ StakingError::InvalidUserAccount,
        constraint = user_token_account.mint  == platform.stake_token_mint @ StakingError::InvalidMint)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut,
        constraint = stake_vault.owner == platform.key() @ StakingError::InvalidVault,
        constraint = stake_vault.mint  == platform.stake_token_mint @ StakingError::InvalidMint)]
    pub stake_vault:        Account<'info, TokenAccount>,
    #[account(mut,
        constraint = (platform.is_renounced || admin_stake_account.owner == platform.authority) @ StakingError::InvalidAdminAccount,
        constraint = admin_stake_account.mint  == platform.stake_token_mint @ StakingError::InvalidMint)]
    pub admin_stake_account: Account<'info, TokenAccount>,
    /// Reward vault — pays multi-level referral rewards on stake (via remaining_accounts).
    #[account(mut,
        constraint = reward_vault.owner == platform.key() @ StakingError::InvalidVault,
        constraint = reward_vault.mint  == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub reward_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner:              Signer<'info>,
    pub token_program:      Program<'info, Token>,
    pub system_program:     Program<'info, System>,
    // remaining_accounts: pairs of [UserAccount PDA (mut), reward ATA (mut)] — up to 10 levels
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform:            Account<'info, Platform>,
    #[account(mut, seeds = [b"user", owner.key().as_ref()], bump = user_account.bump)]
    pub user_account:        Account<'info, UserAccount>,
    // PDA seed verification: proves this entry was created via stake() for this owner
    #[account(mut,
        seeds = [b"stake", owner.key().as_ref(), &stake_entry.stake_id.to_le_bytes()],
        bump = stake_entry.bump,
        has_one = owner @ StakingError::InvalidUserAccount)]
    pub stake_entry:         Account<'info, StakeEntry>,
    #[account(mut,
        constraint = user_token_account.owner == owner.key() @ StakingError::InvalidUserAccount,
        constraint = user_token_account.mint  == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub user_token_account:  Account<'info, TokenAccount>,
    #[account(mut,
        constraint = reward_vault.owner == platform.key() @ StakingError::InvalidVault,
        constraint = reward_vault.mint  == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub reward_vault:        Account<'info, TokenAccount>,
    /// When not renounced: must be authority's reward-mint ATA (receives 1% fee).
    /// When renounced: pass any valid reward-mint token account (fee is skipped).
    #[account(mut,
        constraint = (
            admin_reward_account.owner == platform.authority ||
            platform.is_renounced
        ) @ StakingError::InvalidAdminAccount,
        constraint = admin_reward_account.mint == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub admin_reward_account:          Account<'info, TokenAccount>,
    /// Reward token mint — required for the 1:1 burn CPI
    #[account(mut, constraint = reward_token_mint.key() == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub reward_token_mint:             Account<'info, Mint>,
    /// Receives the 25% passive renounce fee (only used when platform.is_renounced).
    #[account(mut, constraint = fee_recipient_token_account.mint == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub fee_recipient_token_account:   Account<'info, TokenAccount>,
    pub owner:               Signer<'info>,
    pub token_program:       Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CompoundRewards<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform:             Account<'info, Platform>,
    #[account(mut, seeds = [b"user", owner.key().as_ref()], bump = user_account.bump)]
    pub user_account:         Account<'info, UserAccount>,
    #[account(mut,
        seeds = [b"stake", owner.key().as_ref(), &stake_entry.stake_id.to_le_bytes()],
        bump = stake_entry.bump,
        has_one = owner @ StakingError::InvalidUserAccount)]
    pub stake_entry:          Account<'info, StakeEntry>,
    #[account(mut,
        constraint = reward_vault.owner == platform.key() @ StakingError::InvalidVault,
        constraint = reward_vault.mint  == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub reward_vault:         Account<'info, TokenAccount>,
    /// When not renounced: must be authority's reward-mint ATA (receives 1% fee).
    /// When renounced: pass any valid reward-mint token account (fee is skipped).
    #[account(mut,
        constraint = (
            admin_reward_account.owner == platform.authority ||
            platform.is_renounced
        ) @ StakingError::InvalidAdminAccount,
        constraint = admin_reward_account.mint == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub admin_reward_account:          Account<'info, TokenAccount>,
    /// Reward token mint — required for the 1:1 burn CPI
    #[account(mut, constraint = reward_token_mint.key() == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub reward_token_mint:             Account<'info, Mint>,
    /// Receives the 25% passive renounce fee (only used when platform.is_renounced).
    #[account(mut, constraint = fee_recipient_token_account.mint == platform.reward_token_mint @ StakingError::InvalidMint)]
    pub fee_recipient_token_account:   Account<'info, TokenAccount>,
    pub owner:                Signer<'info>,
    pub token_program:        Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform:            Account<'info, Platform>,
    #[account(mut, seeds = [b"user", owner.key().as_ref()], bump = user_account.bump)]
    pub user_account:        Account<'info, UserAccount>,
    #[account(mut,
        seeds = [b"stake", owner.key().as_ref(), &stake_entry.stake_id.to_le_bytes()],
        bump = stake_entry.bump,
        has_one = owner @ StakingError::InvalidUserAccount)]
    pub stake_entry:         Account<'info, StakeEntry>,
    #[account(mut,
        constraint = user_token_account.owner == owner.key() @ StakingError::InvalidUserAccount,
        constraint = user_token_account.mint  == platform.stake_token_mint @ StakingError::InvalidMint)]
    pub user_token_account:  Account<'info, TokenAccount>,
    #[account(mut,
        constraint = stake_vault.owner == platform.key() @ StakingError::InvalidVault,
        constraint = stake_vault.mint  == platform.stake_token_mint @ StakingError::InvalidMint)]
    pub stake_vault:         Account<'info, TokenAccount>,
    #[account(mut,
        constraint = (platform.is_renounced || admin_stake_account.owner == platform.authority) @ StakingError::InvalidAdminAccount,
        constraint = admin_stake_account.mint  == platform.stake_token_mint @ StakingError::InvalidMint)]
    pub admin_stake_account: Account<'info, TokenAccount>,
    pub owner:               Signer<'info>,
    pub token_program:       Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RenounceOwnership<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform:  Account<'info, Platform>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct TriggerHalving<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    pub caller:   Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform:  Account<'info, Platform>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminUserAction<'info> {
    #[account(seeds = [b"platform"], bump = platform.bump)]
    pub platform:     Account<'info, Platform>,
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,
    pub authority:    Signer<'info>,
}

// ===== EVENTS =====

#[event] pub struct RewardPoolFunded       { pub authority: Pubkey, pub amount: u64, pub total_pool: u64 }
#[event] pub struct UserRegistered         { pub user: Pubkey, pub referrer: Option<Pubkey>, pub timestamp: i64 }
#[event] pub struct TokensStaked           { pub user: Pubkey, pub amount: u64, pub fee: u64, pub lock_period: u64, pub unlock_at: i64, pub apy: u64 }
#[event] pub struct RewardsClaimed         { pub user: Pubkey, pub amount: u64, pub fee: u64, pub timestamp: i64 }
#[event] pub struct RewardsCompounded      { pub user: Pubkey, pub amount: u64, pub fee: u64, pub new_stake: u64, pub timestamp: i64 }
#[event] pub struct TokensUnstaked         { pub user: Pubkey, pub amount: u64, pub fee: u64, pub timestamp: i64 }
#[event] pub struct ReferralReward         { pub staker: Pubkey, pub referrer: Pubkey, pub amount: u64, pub level: u8 }
#[event] pub struct RewardRateUpdated      { pub new_rate: u64 }
#[event] pub struct ReferralRateUpdated    { pub new_rate: u64 }
#[event] pub struct LockPeriodAPYUpdated   { pub index: u8, pub apy: u64 }
#[event] pub struct UserBlocked            { pub user: Pubkey }
#[event] pub struct UserUnblocked          { pub user: Pubkey }
#[event] pub struct PlatformPauseToggled   { pub is_paused: bool }
#[event] pub struct TeamTargetTierUpdated  { pub index: u8, pub min_team_staked: u64, pub bonus_bps: u64 }
#[event] pub struct TeamBonusApplied       { pub user: Pubkey, pub bonus_amount: u64 }
#[event] pub struct UserTeamStatsUpdated   { pub user: Pubkey, pub team_size: u64, pub team_total_staked: u64 }
#[event] pub struct TokensBurned           { pub user: Pubkey, pub burn_amount: u64, pub total_burned: u64 }
#[event] pub struct HalvingTriggered       { pub triggered_by: Pubkey, pub halving_epoch: u64, pub timestamp: i64 }
#[event] pub struct OwnershipRenounced     { pub former_owner: Pubkey, pub timestamp: i64 }
#[event] pub struct RenounceFeeCollected   { pub recipient: Pubkey, pub claimant: Pubkey, pub fee_amount: u64, pub total_fees_collected: u64 }

// ===== ERRORS =====

#[error_code]
pub enum StakingError {
    #[msg("Platform is paused")]                          PlatformPaused,
    #[msg("Unauthorized")]                                Unauthorized,
    #[msg("Invalid amount")]                              InvalidAmount,
    #[msg("Invalid lock period")]                         InvalidLockPeriod,
    #[msg("Lock period is still active")]                 LockPeriodActive,
    #[msg("Stake is not active")]                         StakeNotActive,
    #[msg("No rewards to claim")]                         NoRewardsToClaim,
    #[msg("Insufficient reward pool")]                    InsufficientRewardPool,
    #[msg("Claim too early - wait 12 hours")]             ClaimTooEarly,
    #[msg("User is blocked")]                             UserBlocked,
    #[msg("Overflow error")]                              OverflowError,
    #[msg("Invalid admin fee account")]                   InvalidAdminAccount,
    #[msg("Invalid token mint")]                          InvalidMint,
    #[msg("Invalid tier index (0-9)")]                    InvalidTierIndex,
    #[msg("Team bonus BPS exceeds maximum")]              TeamBonusTooHigh,
    // Security additions
    #[msg("Cannot refer yourself")]                       SelfReferral,
    #[msg("Referrer account does not match referrer key")] ReferrerMismatch,
    #[msg("Invalid vault account")]                       InvalidVault,
    #[msg("Invalid user token account")]                  InvalidUserAccount,
    #[msg("APY exceeds maximum allowed value")]           APYTooHigh,
    #[msg("Halving is not due yet — must wait 1 year")]   HalvingNotDue,
    #[msg("Ownership has already been renounced")]        AlreadyRenounced,
    #[msg("Fee recipient token account does not match")]  InvalidFeeRecipient,
}
