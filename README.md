# FBiT Staking — Multi-Chain DApp

A production-ready, decentralized staking platform for the **FBiT token** running on **Solana** and **Polygon** networks simultaneously. The platform implements Proof-of-Stake (PoS) APY, a 10-level referral commission system, a Team Target Bonus program, a deflationary burn mechanism, and an automated emission reserve — all governed by on-chain smart contracts.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [How It Works — Complete Flow](#2-how-it-works--complete-flow)
3. [Reward & Fee System](#3-reward--fee-system)
4. [10-Level Referral System](#4-10-level-referral-system)
5. [Team Target Bonus](#5-team-target-bonus)
6. [Burn & PoS Emission System](#6-burn--pos-emission-system)
7. [Ownership Renouncement](#7-ownership-renouncement)
8. [Admin Panel](#8-admin-panel)
9. [Smart Contracts](#9-smart-contracts)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Security System](#11-security-system)
12. [Project Structure](#12-project-structure)
13. [Environment Variables](#13-environment-variables)
14. [Deployment Guide](#14-deployment-guide)
15. [Technology Stack](#15-technology-stack)
16. [Token Addresses](#16-token-addresses)

---

## 1. Project Overview

FBiT Staking is a fully on-chain staking DApp where users lock FBiT tokens for **30 days** and earn rewards. The APY is not fixed — it adjusts automatically based on how many tokens are currently staked (Proof-of-Stake model). As more users stake, the APY decreases; as users unstake, the APY rises. The system is designed to be fully autonomous — once the admin deposits the full token reserve and renounces ownership, the contract runs indefinitely without any human intervention.

### Core Highlights

| Feature | Details |
|---------|---------|
| Lock Period | 30 days (fixed) |
| Claim Interval | Every 12 hours |
| APY Range | 60% – 500% (auto-adjusting, PoS) |
| Burn Rate | 10% of gross reward (burned to dead address) |
| Referral Levels | 10 levels deep |
| Referral Total | 30% distributed across all 10 levels |
| Team Bonus | Up to +10% on top of staking rewards |
| Networks | Solana Mainnet + Polygon Mainnet (Chain ID: 137) |
| Platform Fee | 1% on all operations (removed after ownership renouncement) |

---

## 2. How It Works — Complete Flow

### Step 1 — Connect Wallet
Users connect their wallet via **Reown (WalletConnect)**:
- **Solana**: Phantom, Solflare, or any Reown-compatible Solana wallet
- **Polygon**: MetaMask or any WalletConnect-compatible EVM wallet

### Step 2 — Register with a Referral Link (Optional)
Before staking, a user can click a referral link (`?ref=<address>`). This stores the referrer on-chain and credits all 10 levels of the referral chain when the user stakes.

### Step 3 — Stake FBiT Tokens
1. User enters an amount of FBiT tokens.
2. Smart contract deducts a **1% platform fee** (sent to admin).
3. Remaining tokens are locked for **30 days**.
4. The contract records the effective APY at stake time for display.
5. The referral chain (up to 10 levels) immediately receives commissions from the reward pool.

### Step 4 — Earn Rewards
Rewards accumulate every **12 hours**. Formula:

```
grossReward = stakedAmount × effectiveAPY × intervals / (730 × 10,000)

Where:
  effectiveAPY = clamp(ANNUAL_EMISSION × 10,000 / totalStaked, 10,000, 50,000)
  intervals    = seconds elapsed / 43,200 (each interval = 12 hours)
  730          = total 12-hour intervals in one year
```

The APY self-adjusts in real time:
- More stakers → lower APY (reward pie splits among more people)
- Fewer stakers → higher APY (each person gets a larger share)

### Step 5 — Claim or Compound Rewards
Every 12 hours the user can:

- **Claim**: Receive net FBiT reward to their wallet
- **Compound**: Re-stake the net reward, increasing their stake (and future earnings)

In both cases, the burn mechanism applies (see Section 3).

### Step 6 — Unstake After 30 Days
Once the lock period expires, the user calls Unstake. The contract:
1. Deducts 1% fee from the principal (removed after renouncement).
2. Transfers the remaining principal back to the user.

---

## 3. Reward & Fee System

### Before Ownership Renouncement

```
Gross Reward (R)
    │
    ├─ 1% Platform Fee  ──────────────────────→ Admin wallet
    │
    └─ 99% After Fee (A)
            │
            ├─ 10% Burn (A × 10%)  ───────────→ Dead address (0x000...dEaD) 🔥
            │
            └─ 90% Net Reward (A × 90%)  ──────→ User wallet ✅
```

### After Ownership Renouncement

```
Gross Reward (R)
    │
    ├─ 0% Platform Fee  (removed — no admin)
    │
    └─ 100% After Fee (A = R)
            │
            ├─ 10% Burn (R × 10%)  ───────────→ Dead address 🔥
            │
            ├─ 25% Fee  ──────────────────────→ feeRecipient (former admin)
            │   (of gross reward, from pool separately)
            │
            └─ Remaining  ────────────────────→ User wallet ✅
                (from pool — pool provides extra for feeRecipient)
```

> **Note:** After renouncement, the 1% transaction fee disappears. Instead, the former admin's address (`feeRecipient`) receives a passive income from the reward pool on every claim and compound. The burn (10%) always applies regardless of renouncement status.

### Team Bonus
If the user qualifies for a Team Target Tier (see Section 5), the bonus is added on top of the gross reward before any deductions:

```
totalGross = grossReward + teamBonus
```

---

## 4. 10-Level Referral System

When user A refers user B (and B stakes), users in the referral chain up to 10 levels above B each instantly receive a commission **directly from the reward pool**:

| Level | Commission | Who Receives |
|-------|-----------|-------------|
| 1 | 0.25% | Direct referrer (person who referred the staker) |
| 2 | 0.50% | Referrer's referrer |
| 3 | 1.25% | Level 3 upline |
| 4 | 1.50% | Level 4 upline |
| 5 | 2.00% | Level 5 upline |
| 6 | 3.25% | Level 6 upline |
| 7 | 3.50% | Level 7 upline |
| 8 | 4.25% | Level 8 upline |
| 9 | 5.50% | Level 9 upline |
| 10 | 8.00% | Level 10 upline |
| **Total** | **30.00%** | Distributed instantly on stake |

Referral commissions are paid **immediately** when the downstream user stakes — no waiting for claims.

### Referral Link Format
```
https://yourdomain.com/?ref=<wallet_address>
```

---

## 5. Team Target Bonus

On top of base staking rewards, users who build large teams earn an additional bonus multiplier. The bonus is based on the **total FBiT staked by all downline members** (up to 10 referral levels deep):

| Tier | Label | Min Team Staked | Bonus |
|------|-------|----------------|-------|
| 1 | Bronze | 200,000 FBiT | +2% |
| 2 | Silver | 350,000 FBiT | +3% |
| 3 | Gold | 500,000 FBiT | +4% |
| 4 | Platinum | 1,000,000 FBiT | +5% |
| 5 | Diamond | 5,000,000 FBiT | +6% |
| 6 | Ruby | 10,000,000 FBiT | +7% |
| 7 | Emerald | 50,000,000 FBiT | +7.5% |
| 8 | Sapphire | 100,000,000 FBiT | +8.5% |
| 9 | Obsidian | 500,000,000 FBiT | +9% |
| 10 | Titan | 1,000,000,000 FBiT | +10% |

The bonus applies automatically on every claim or compound — no user action required.

---

## 6. Burn & PoS Emission System

### Reward Burn (10% per Claim/Compound)
Every time a user claims or compounds, **10% of their gross reward is permanently burned** by sending tokens to the dead address (`0x000000000000000000000000000000000000dEaD` on Polygon). This is deflationary — it reduces the total circulating supply over time.

- The burn comes from the **user's share** — the reward pool does not pay extra for this.
- The burn percentage (`burnBps`) can be adjusted by the admin (range: 0–50%).

### Automated Annual Emission Reserve
The contract includes a long-term **emission reserve** system:

1. **Admin deposits** the full token supply once (e.g., 800,000,000 FBiT).
2. The contract **automatically releases** `ANNUAL_EMISSION` tokens per year from the reserve into the active reward pool.
3. Default: **1,000,000 FBiT/year** → sustains 800 years of rewards.
4. The emission release is triggered automatically on every claim/compound — no cron job needed.

### Auto Year-End Burn
Once per year, the contract automatically burns any **surplus** tokens in the active reward pool (tokens above what all active stakers could possibly claim). This prevents pool bloat and accelerates token deflation.

- User rewards are protected — only genuine surplus is burned.
- Shortens the emission schedule (fewer years remain after each annual burn).

### PoS APY Formula
```
effectiveAPY (bps) = clamp(
    ANNUAL_EMISSION × 10,000 / totalStaked,
    MIN_APY_BPS =  6,000,   // 60% floor
    MAX_APY_BPS = 50,000    // 500% ceiling
)
```

When no one is staking: APY = 500% (maximum, attracts stakers).
As more tokens are staked: APY decreases automatically.
The APY is always between 60% and 500%.

---

## 7. Ownership Renouncement

The admin can call **Renounce Ownership** from the Admin Panel. This is a **one-way, irreversible action**. After renouncement:

| Before Renounce | After Renounce |
|----------------|----------------|
| 1% fee on all operations → admin wallet | 0% platform fee |
| Admin can pause/unpause, block users, etc. | No admin — contract is autonomous |
| Admin can fund reward pool, set rates | Cannot change any parameter |
| Admin can set annual emission | Emission locked forever |
| Admin can emergency withdraw (when paused) | No emergency withdraw possible |

After renouncement, the former admin's address becomes `feeRecipient` and passively earns income from the reward pool on every user claim/compound. This is the admin's permanent passive revenue in exchange for giving up control.

> **Important:** Before renouncing, the admin must:
> - Deposit the full token reserve (`depositReserve`)
> - Set the desired annual emission (`setAnnualEmission`)
> - Configure all Team Target Tiers correctly
> - Ensure the reward pool has sufficient balance

---

## 8. Admin Panel

The Admin Panel is accessible only to wallet addresses listed in `NEXT_PUBLIC_ADMIN_ADDRESSES`. It provides:

### Reward Pool Management
| Action | Description |
|--------|-------------|
| Fund Reward Pool | Directly add tokens to the active reward pool |
| Deposit Reserve | Deposit tokens into the long-term emission reserve |
| Release Emission | Manually trigger release of pending reserve emission |
| Burn Unused Pool | Burn surplus pool tokens (only genuine surplus, never user rewards) |

### Platform Parameters
| Action | Description |
|--------|-------------|
| Set Reward Rate | Adjust the base reward multiplier |
| Set Referral Reward Rate | Adjust referral commission multiplier |
| Set Annual Emission | Set tokens distributed per year (drives PoS APY) |
| Set Burn % | Set the burn rate on claims (0–50%, in basis points) |

### Team Target Tiers
Admin can update all 10 Team Target Tiers on-chain — minimum team staked threshold and bonus percentage for each tier.

### User Management
| Action | Description |
|--------|-------------|
| Block User | Prevent a wallet from staking/claiming |
| Unblock User | Restore access for a blocked wallet |
| Pause Platform | Emergency halt — disables all staking operations |
| Unpause Platform | Resume normal operations |

### Ownership Renouncement
Permanently transfers to a trustless, admin-free operation mode.

---

## 9. Smart Contracts

### Polygon Contract — `FBiTStaking.sol`

**Location:** `contracts/polygon/contracts/FBiTStaking.sol`

Built with Solidity 0.8.20 using OpenZeppelin libraries:
- `Ownable` — access control
- `ReentrancyGuard` — prevents reentrancy attacks
- `Pausable` — emergency stop mechanism
- `SafeERC20` — safe token transfers

**Key Constants:**
```solidity
uint256 public constant CLAIM_INTERVAL   = 43200;   // 12 hours
uint256 public constant LOCK_PERIOD      = 30;      // 30 days
uint256 public constant PLATFORM_FEE_BPS = 100;     // 1%
uint256 public constant MIN_APY_BPS      =  6_000;  // 60%
uint256 public constant MAX_APY_BPS      = 50_000;  // 500%
uint256 public constant MAX_BURN_BPS     = 5000;    // 50% max
uint256 public BURN_BPS                  = 1000;    // 10% initial (adjustable)
```

**Public Functions:**
```solidity
registerUser(address _referrer)        // Register before staking
stake(uint256 _amount)                 // Stake FBiT tokens
claimRewards(uint256 _stakeId)         // Claim rewards (every 12h)
compoundRewards(uint256 _stakeId)      // Compound rewards back into stake
unstake(uint256 _stakeId)              // Withdraw after 30-day lock
releaseEmission()                      // Trigger reserve → pool release (anyone can call)
```

**Admin Functions:**
```solidity
depositReserve(uint256 _amount)
fundRewardPool(uint256 _amount)
setRewardRate(uint256 _newRate)
setReferralRewardRate(uint256 _newRate)
setAnnualEmission(uint256 _annualEmission)
setBurnBps(uint256 _burnBps)
setTeamTargetTier(uint8 _index, uint256 _minTeamStaked, uint256 _bonusBps)
blockUser(address _user)
unblockUser(address _user)
pause() / unpause()
emergencyWithdraw(address _token, address _to, uint256 _amount)
burnUnusedPool(uint256 _amount)
renounceOwnershipWithFee()
```

**Events emitted:** `TokensStaked`, `RewardsClaimed`, `RewardsCompounded`, `TokensUnstaked`, `TokensBurned`, `EmissionReleased`, `UnusedPoolBurned`, `OwnershipRenounced`, `RenounceFeeCollected`, `UserRegistered`, `ReferralReward`, `TeamBonusApplied`, and more.

---

### Solana Contract — Anchor/Rust

**Location:** `contracts/solana/programs/fbit-staking/`

Built with the Anchor framework for Solana. Uses PDAs (Program Derived Addresses) for trustless account management.

**Program Instructions:**
- `initialize` — Set up the platform PDA
- `register_user` — Create a UserAccount PDA for new users
- `stake` — Stake FBiT SPL tokens
- `claim_rewards` — Claim accumulated rewards
- `compound_rewards` — Compound rewards back into stake
- `unstake` — Withdraw principal after lock period
- `fund_reward_pool` — Admin: add tokens to pool
- `set_reward_rate` — Admin: update reward rate
- `set_referral_reward_rate` — Admin: update referral rate
- `block_user` / `unblock_user` — Admin: user management
- `toggle_pause` — Admin: emergency pause
- `renounce_ownership` — Admin: one-way autonomy

**Accounts:**
- `Platform` PDA — global state (total staked, pool balance, rates, etc.)
- `UserAccount` PDA — per-user state (stakes, referrals, team stats)
- `StakeEntry` PDA — individual stake record
- Vault token accounts — hold staked FBiT and reward FBiT

---

## 10. Frontend Architecture

**Location:** `web/`

Built with **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**.

### Pages
| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `page.tsx` | Home — renders the full Dashboard |

### Components

#### `web/src/components/staking/`
| File | Purpose |
|------|---------|
| `Dashboard.tsx` | Main view: Active Stakes list, Burn & PoS panel, Team Bonus panel, Transaction History |
| `StakePanel.tsx` | Stake form: amount input, APY display, reward estimation, stake button |

#### `web/src/components/admin/`
| File | Purpose |
|------|---------|
| `AdminPanel.tsx` | Full admin control: fund pool, set rates, manage users, Team Tiers, Renounce Ownership |

#### `web/src/components/referral/`
| File | Purpose |
|------|---------|
| `ReferralPanel.tsx` | Referral link generator, referral stats, commission history |

#### `web/src/components/market/`
| File | Purpose |
|------|---------|
| `TokenPriceWidget.tsx` | Live FBiT price and market data |

#### `web/src/components/ui/`
| File | Purpose |
|------|---------|
| `ContractSetupNotice.tsx` | Warning banner when `.env.local` contract addresses are not set |

### Hooks
| Hook | Purpose |
|------|---------|
| `useContract.ts` | Unified interface — routes calls to Solana or Polygon based on selected network |
| `useSolanaStaking.ts` | All Solana on-chain reads/writes via `@solana/web3.js` + Anchor IDL |
| `usePolygonStaking.ts` | All Polygon on-chain reads/writes via `ethers.js` v6 |
| `useTokenPrice.ts` | Fetches live FBiT price from market APIs |
| `useTokenLogo.ts` | Resolves token logo URL |

### State Management
Zustand store (`web/src/lib/store.ts`) with localStorage persistence:
- `selectedNetwork` — 'solana' or 'polygon'
- `walletStates` — per-wallet stakes, transactions, balances, referral info
- `platformStats` — total staked, APY, burn rate, pool balance, emission data

Store key: `fbit-staking-v4` (versioned to force fresh state on breaking changes).

### Context
`WalletContext.tsx` — unified wallet connection state:
- Solana wallet (via Reown/AppKit)
- Polygon wallet (via Reown/AppKit)
- `address` — active wallet address (either chain)
- `solanaReferrer` / `polygonReferrer` — referrer from URL param

### Contract Interface (`useContract.ts`)
All buttons in the UI call through this single hook:

```typescript
contract.stake(amount, referrer?)           // Stake tokens
contract.claimReward(stakeId)               // Claim rewards
contract.compoundReward(stakeId)            // Compound rewards
contract.unstake(stakeId)                   // Unstake after lock
contract.syncUserData()                     // Refresh user's on-chain data
contract.syncPlatformStats()               // Refresh platform stats
contract.adminFundPool(amount)              // Admin: fund pool
contract.adminSetRewardRate(rate)           // Admin: set reward rate
contract.adminBlockUser(address)            // Admin: block user
contract.adminRenounceOwnership()          // Admin: renounce ownership
// ... and more
```

---

## 11. Security System

**Location:** `web/src/lib/security.ts`

### Rate Limiting
Every on-chain write is protected by a client-side rate limiter:

| Action | Limit |
|--------|-------|
| Stake | 3 attempts per 2 minutes |
| Claim / Compound | 5 attempts per minute |
| Admin actions | 3 attempts per minute per action |

```typescript
if (!checkRateLimit('stake', { maxCalls: 3, windowMs: 120_000 })) {
  toast.error('Too many attempts. Please wait.');
  return;
}
```

### Input Validation
```typescript
isValidEVMAddress(addr)      // 0x + 40 hex chars
isValidSolanaAddress(addr)   // base58, 32–44 chars
isValidWalletAddress(addr)   // accepts either chain
isValidAmount(amount)        // finite, positive, max 6 decimals
isValidBps(bps)              // integer 0–10,000
isValidBonusBps(bps)         // integer 1–1,000
sanitizeText(value)          // strips HTML/script tags (XSS prevention)
```

### Smart Contract Security
- **Reentrancy Guard**: Both contracts use `nonReentrant` modifier
- **SafeERC20**: Prevents silent token transfer failures (Polygon)
- **Overflow Protection**: Solidity 0.8.x built-in checked arithmetic
- **Access Control**: `onlyOwner` modifier on all admin functions
- **Emergency Pause**: Instantly halts all user-facing operations
- **Lock Period Enforcement**: Unstake reverts if called before `unlockAt`

---

## 12. Project Structure

```
FBiT-Staking/
│
├── contracts/
│   ├── polygon/                        # EVM (Polygon) smart contract
│   │   ├── contracts/
│   │   │   └── FBiTStaking.sol         # Main Solidity contract
│   │   ├── scripts/
│   │   │   └── deploy.js               # Hardhat deploy script
│   │   ├── hardhat.config.js           # Hardhat config (Polygon mainnet)
│   │   ├── .env.example                # Required env vars for deployment
│   │   └── package.json
│   │
│   └── solana/                         # Solana Anchor program
│       ├── programs/fbit-staking/      # Rust source code
│       ├── scripts/
│       │   ├── initialize.ts           # Initialize platform PDA
│       │   └── update-team-tiers.ts    # Update tiers on-chain
│       ├── target/idl/                 # Auto-generated IDL (after build)
│       ├── Anchor.toml                 # Anchor config (mainnet)
│       └── Cargo.toml
│
└── web/                                # Next.js frontend
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx              # Root layout with providers
    │   │   └── page.tsx                # Home page
    │   ├── components/
    │   │   ├── layout/                 # Header, navigation, network switcher
    │   │   ├── staking/
    │   │   │   ├── Dashboard.tsx       # Active stakes, burn panel, history
    │   │   │   └── StakePanel.tsx      # Stake form
    │   │   ├── admin/
    │   │   │   └── AdminPanel.tsx      # Full admin control panel
    │   │   ├── referral/
    │   │   │   └── ReferralPanel.tsx   # Referral link & stats
    │   │   ├── market/
    │   │   │   └── TokenPriceWidget.tsx # FBiT price widget
    │   │   └── ui/
    │   │       └── ContractSetupNotice.tsx # Setup guidance banner
    │   ├── context/
    │   │   └── WalletContext.tsx       # Unified wallet state
    │   ├── hooks/
    │   │   ├── useContract.ts          # Unified contract interface
    │   │   ├── useSolanaStaking.ts     # Solana reads/writes
    │   │   └── usePolygonStaking.ts    # Polygon reads/writes
    │   ├── lib/
    │   │   ├── config.ts               # Network configuration
    │   │   ├── store.ts                # Zustand global state (v4)
    │   │   ├── security.ts             # Rate limiting & validation
    │   │   ├── utils.ts                # Formatting helpers
    │   │   ├── reown.ts                # WalletConnect/Reown setup
    │   │   └── contracts/
    │   │       ├── solana.ts           # Solana contract helpers
    │   │       └── polygon.ts          # Polygon contract helpers
    │   ├── providers/
    │   │   └── AppKitProvider.tsx      # Reown AppKit wallet provider
    │   ├── idl/
    │   │   └── fbit_staking.ts         # Anchor IDL (TypeScript)
    │   ├── types/
    │   │   └── index.ts                # All TypeScript interfaces
    │   └── styles/
    │       └── globals.css             # Tailwind + custom CSS variables
    ├── .env.local                      # Active environment (gitignored)
    ├── .env.mainnet                    # Mainnet env template
    ├── .env.testnet                    # Testnet env template
    ├── next.config.mjs
    ├── tailwind.config.js
    └── package.json
```

---

## 13. Environment Variables

All frontend configuration lives in `web/.env.local`:

```bash
# ===== ADMIN ACCESS =====
# Wallet addresses that can access the Admin Panel
NEXT_PUBLIC_ADMIN_ADDRESSES=<solana_address>,<evm_address>

# ===== REOWN (WalletConnect) =====
NEXT_PUBLIC_REOWN_PROJECT_ID=<your_project_id>

# ===== SOLANA MAINNET =====
NEXT_PUBLIC_SOLANA_RPC_URL=https://solana-rpc.publicnode.com
NEXT_PUBLIC_SOLANA_PROGRAM_ID=<deployed_anchor_program_id>     # ⚠ Required
NEXT_PUBLIC_SOLANA_STAKE_TOKEN_MINT=CuubBzUTnQ4H2D2fHJCVWGEUEod2fJzq4nAPwfx8UGTu
NEXT_PUBLIC_SOLANA_REWARD_TOKEN_MINT=CuubBzUTnQ4H2D2fHJCVWGEUEod2fJzq4nAPwfx8UGTu
NEXT_PUBLIC_SOLANA_STAKE_VAULT=   # Optional — auto-derived from Program ID
NEXT_PUBLIC_SOLANA_REWARD_VAULT=  # Optional — auto-derived from Program ID

# ===== POLYGON MAINNET =====
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com
NEXT_PUBLIC_POLYGON_CHAIN_ID=137
NEXT_PUBLIC_POLYGON_CONTRACT_ADDRESS=<deployed_contract_address> # ⚠ Required
NEXT_PUBLIC_POLYGON_STAKE_TOKEN=0x9003e7d3Fbec68bA1f2A253e7F1be9F631f46c55
NEXT_PUBLIC_POLYGON_REWARD_TOKEN=0x9003e7d3Fbec68bA1f2A253e7F1be9F631f46c55
```

> **Note:** The app shows a `ContractSetupNotice` warning until both `PROGRAM_ID` (Solana) and `CONTRACT_ADDRESS` (Polygon) are filled in. All staking buttons are disabled until contracts are configured.

---

## 14. Deployment Guide

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Frontend + Hardhat |
| Rust | stable | Solana program compilation |
| Anchor CLI | 0.29+ | Solana framework |
| Solana CLI | 1.18+ | Wallet + deployment |

---

### A. Deploy Polygon Contract

```bash
cd contracts/polygon
npm install

# Create .env from example
cp .env.example .env
```

Edit `contracts/polygon/.env`:
```
PRIVATE_KEY=<your_deployer_private_key>
POLYGON_MAINNET_RPC=https://polygon-bor-rpc.publicnode.com
POLYGONSCAN_API_KEY=<your_polygonscan_api_key>
STAKE_TOKEN_ADDRESS=0x9003e7d3Fbec68bA1f2A253e7F1be9F631f46c55
REWARD_TOKEN_ADDRESS=0x9003e7d3Fbec68bA1f2A253e7F1be9F631f46c55
```

```bash
# Compile
npx hardhat compile

# Deploy to Polygon Mainnet
npx hardhat run scripts/deploy.js --network polygon_mainnet

# Verify on Polygonscan
npx hardhat verify --network polygon_mainnet <CONTRACT_ADDRESS> \
  <STAKE_TOKEN> <REWARD_TOKEN> 1000 500 1000000000000

# Copy the deployed contract address into web/.env.local:
# NEXT_PUBLIC_POLYGON_CONTRACT_ADDRESS=<CONTRACT_ADDRESS>
```

---

### B. Deploy Solana Program

```bash
cd contracts/solana
npm install

# Set Solana CLI to mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Build the Anchor program
anchor build

# Deploy to Solana Mainnet
anchor deploy --provider.cluster mainnet

# The output shows: "Program Id: <PROGRAM_ID>"
# Copy it into web/.env.local:
# NEXT_PUBLIC_SOLANA_PROGRAM_ID=<PROGRAM_ID>

# Also update Anchor.toml:
# [programs.mainnet]
# fbit_staking = "<PROGRAM_ID>"

# Initialize the platform PDA (run once after deploy)
npx ts-node scripts/initialize.ts
```

---

### C. Run the Frontend

```bash
cd web
npm install

# Copy and fill in your env
cp .env.mainnet .env.local
# Edit .env.local: add PROGRAM_ID and CONTRACT_ADDRESS

# Development server
npm run dev
# → http://localhost:3000

# Production build
npm run build
npm start
```

---

### D. Post-Deployment Checklist

- [ ] Polygon contract deployed and verified on Polygonscan
- [ ] Solana program deployed and initialized
- [ ] `.env.local` has both contract addresses
- [ ] Admin panel accessible from admin wallet
- [ ] Deposit reward reserve: Admin → `depositReserve` with full token supply
- [ ] Set annual emission: Admin → `setAnnualEmission`
- [ ] Configure Team Target Tiers: Admin → Sync All Tiers
- [ ] Fund active reward pool if needed: Admin → `fundRewardPool`
- [ ] Test stake / claim / compound / unstake end-to-end
- [ ] Renounce ownership when ready (irreversible!)

---

## 15. Technology Stack

| Layer | Technology |
|-------|-----------|
| Solana Contract | Rust + Anchor Framework 0.29 |
| Polygon Contract | Solidity 0.8.20 + Hardhat + OpenZeppelin 5 |
| Frontend Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| State Management | Zustand v4 (with localStorage persistence) |
| Solana SDK | `@solana/web3.js`, `@solana/spl-token`, `@coral-xyz/anchor` |
| Polygon SDK | `ethers.js` v6 |
| Wallet Connection | Reown AppKit (formerly WalletConnect) |
| Supported Wallets | Phantom, Solflare (Solana) · MetaMask, WalletConnect (Polygon) |
| Toast Notifications | `react-hot-toast` |
| Deployment | Vercel / any Node.js host |

---

## 16. Token Addresses

### FBiT Token — Polygon Mainnet
```
0x9003e7d3Fbec68bA1f2A253e7F1be9F631f46c55
```
[View on Polygonscan](https://polygonscan.com/token/0x9003e7d3Fbec68bA1f2A253e7F1be9F631f46c55)

### FBiT Token — Solana Mainnet
```
CuubBzUTnQ4H2D2fHJCVWGEUEod2fJzq4nAPwfx8UGTu
```
[View on Solana Explorer](https://explorer.solana.com/address/CuubBzUTnQ4H2D2fHJCVWGEUEod2fJzq4nAPwfx8UGTu)

---

## License

MIT — Free to use, modify, and distribute.

---

*Built for the FBiT ecosystem. Multi-chain, autonomous, deflationary.*
