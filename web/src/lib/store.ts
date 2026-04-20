import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  NetworkType,
  StakeEntry,
  PlatformStats,
  UserAccount,
  ReferralInfo,
  TxRecord,
  WalletData,
} from '@/types';

// ─── Empty wallet data for new connections ────────────────────────────────────
function createEmptyWalletData(address: string): WalletData {
  const now = Math.floor(Date.now() / 1000);
  const userAccount: UserAccount = {
    address,
    totalStaked: 0,
    totalRewardsEarned: 0,
    totalReferralRewards: 0,
    referrer: null,
    referralCount: 0,
    teamSize: 0,
    teamTotalStaked: 0,
    isBlocked: false,
    registeredAt: now,
  };
  const referralInfo: ReferralInfo = {
    totalReferrals: 0,
    totalReferralRewards: 0,
    referralLink: '',
    referrals: [],
    chain: [],
  };
  return {
    stakes: [],
    tokenBalance: 0,
    transactions: [],
    userAccount,
    referralInfo,
    teamStats: { teamSize: 0, teamTotalStaked: 0 },
  };
}

// ─── Platform baseline ────────────────────────────────────────────────────────
const BASE_PLATFORM_STATS: PlatformStats = {
  totalStaked: 0,
  totalUsers: 0,
  rewardPoolBalance: 0,
  rewardRate: 0,
  referralRewardRate: 0,
  isPaused: false,
  totalBurned: 0,
  annualEmission: 0,
  burnBps: 1000,
  effectiveAPY: 6000,
  totalReserve: 0,
  emissionStartTime: 0,
  totalEmissionReleased: 0,
  releasableEmission: 0,
  totalYearlyBurned: 0,
  lastYearBurnTime: 0,
  remainingYears: 800,
  maxPendingRewards: 0,
  isRenounced: false,
  feeRecipient: '',
  totalFeesCollected: 0,
};

// ─── Store types ──────────────────────────────────────────────────────────────
interface AppState {
  // Network
  selectedNetwork: NetworkType;
  setSelectedNetwork: (network: NetworkType) => void;

  // Wallet (active)
  walletAddress: string | null;
  isConnected: boolean;
  setWallet: (address: string | null) => void; // kept for WalletContext compat

  // Per-wallet persistent data
  walletStates: Record<string, WalletData>;

  // Platform
  platformStats: PlatformStats;
  updatePlatformStats: (partial: Partial<PlatformStats>) => void;

  // UI
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAdmin: boolean;
  setIsAdmin: (v: boolean) => void;

  // Stake actions (operate on active wallet)
  addStake: (stake: StakeEntry) => void;
  claimStakeReward: (id: number | string, reward: number) => void;
  compoundStakeReward: (id: number | string, reward: number) => void;
  unstakeEntry: (id: number | string) => void;
  addTransaction: (tx: TxRecord) => void;

  /**
   * Overwrite wallet state with fresh on-chain data.
   * Keeps existing transactions (local-only) intact.
   */
  loadOnChainData: (
    address: string,
    data: { stakes?: StakeEntry[]; tokenBalance?: number; userAccount?: UserAccount; referralInfo?: ReferralInfo }
  ) => void;

  // Helper: get active wallet data
  getWalletData: () => WalletData | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Network
      selectedNetwork: 'solana',
      setSelectedNetwork: (network) => set({ selectedNetwork: network }),

      // ── Wallet
      walletAddress: null,
      isConnected: false,
      setWallet: (address) => {
        if (!address) {
          set({ walletAddress: null, isConnected: false });
          return;
        }
        // Initialise wallet data if first time
        const existing = get().walletStates[address];
        if (!existing) {
          const data = createEmptyWalletData(address);
          set(state => ({
            walletAddress: address,
            isConnected: true,
            platformStats: {
              ...state.platformStats,
              totalUsers: state.platformStats.totalUsers + 1,
            },
            walletStates: { ...state.walletStates, [address]: data },
          }));
        } else {
          set({ walletAddress: address, isConnected: true });
        }
      },

      // ── Per-wallet data
      walletStates: {},

      // ── Platform
      platformStats: BASE_PLATFORM_STATS,
      updatePlatformStats: (partial) =>
        set(state => ({ platformStats: { ...state.platformStats, ...partial } })),

      // ── UI
      isLoading: false,
      setIsLoading: (v) => set({ isLoading: v }),
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),
      isAdmin: false,
      setIsAdmin: (v) => set({ isAdmin: v }),

      // ── Stake actions
      addStake: (stake) => {
        const addr = get().walletAddress;
        if (!addr) return;
        set(state => {
          const wd = state.walletStates[addr] ?? createEmptyWalletData(addr);
          return {
            walletStates: {
              ...state.walletStates,
              [addr]: {
                ...wd,
                stakes: [...wd.stakes, stake],
                tokenBalance: wd.tokenBalance - stake.amount,
                userAccount: {
                  ...wd.userAccount,
                  totalStaked: wd.userAccount.totalStaked + stake.amount,
                },
              },
            },
            platformStats: {
              ...state.platformStats,
              totalStaked: state.platformStats.totalStaked + stake.amount,
            },
          };
        });
      },

      claimStakeReward: (id, reward) => {
        const addr = get().walletAddress;
        if (!addr) return;
        const now = Math.floor(Date.now() / 1000);
        set(state => {
          const wd = state.walletStates[addr] ?? createEmptyWalletData(addr);
          return {
            walletStates: {
              ...state.walletStates,
              [addr]: {
                ...wd,
                stakes: wd.stakes.map(s =>
                  s.id === id
                    ? { ...s, lastClaimAt: now, totalClaimed: s.totalClaimed + reward }
                    : s
                ),
                tokenBalance: wd.tokenBalance + reward,
                userAccount: {
                  ...wd.userAccount,
                  totalRewardsEarned: wd.userAccount.totalRewardsEarned + reward,
                },
              },
            },
          };
        });
      },

      compoundStakeReward: (id, reward) => {
        const addr = get().walletAddress;
        if (!addr) return;
        const now = Math.floor(Date.now() / 1000);
        set(state => {
          const wd = state.walletStates[addr] ?? createEmptyWalletData(addr);
          return {
            walletStates: {
              ...state.walletStates,
              [addr]: {
                ...wd,
                stakes: wd.stakes.map(s =>
                  s.id === id
                    ? {
                        ...s,
                        amount: s.amount + reward,
                        lastClaimAt: now,
                        totalClaimed: s.totalClaimed + reward,
                      }
                    : s
                ),
                userAccount: {
                  ...wd.userAccount,
                  totalStaked: wd.userAccount.totalStaked + reward,
                  totalRewardsEarned: wd.userAccount.totalRewardsEarned + reward,
                },
              },
            },
            platformStats: {
              ...state.platformStats,
              totalStaked: state.platformStats.totalStaked + reward,
            },
          };
        });
      },

      unstakeEntry: (id) => {
        const addr = get().walletAddress;
        if (!addr) return;
        const stake = get().walletStates[addr]?.stakes.find(s => s.id === id);
        if (!stake) return;
        set(state => {
          const wd = state.walletStates[addr];
          return {
            walletStates: {
              ...state.walletStates,
              [addr]: {
                ...wd,
                stakes: wd.stakes.map(s =>
                  s.id === id ? { ...s, isActive: false } : s
                ),
                tokenBalance: wd.tokenBalance + stake.amount,
                userAccount: {
                  ...wd.userAccount,
                  totalStaked: wd.userAccount.totalStaked - stake.amount,
                },
              },
            },
            platformStats: {
              ...state.platformStats,
              totalStaked: state.platformStats.totalStaked - stake.amount,
            },
          };
        });
      },

      addTransaction: (tx) => {
        const addr = get().walletAddress;
        if (!addr) return;
        set(state => {
          const wd = state.walletStates[addr] ?? createEmptyWalletData(addr);
          return {
            walletStates: {
              ...state.walletStates,
              [addr]: {
                ...wd,
                transactions: [tx, ...wd.transactions].slice(0, 50), // keep last 50
              },
            },
          };
        });
      },

      loadOnChainData: (address, { stakes, tokenBalance, userAccount, referralInfo }) => {
        set(state => {
          // Auto-init wallet state if not yet created (e.g. setWallet race condition).
          const wd = state.walletStates[address] ?? createEmptyWalletData(address);
          return {
            walletStates: {
              ...state.walletStates,
              [address]: {
                ...wd,
                ...(stakes        !== undefined ? { stakes }        : {}),
                ...(tokenBalance  !== undefined ? { tokenBalance }  : {}),
                ...(userAccount   !== undefined ? { userAccount }   : {}),
                ...(referralInfo  !== undefined ? { referralInfo }  : {}),
              },
            },
          };
        });
      },

      getWalletData: () => {
        const addr = get().walletAddress;
        if (!addr) return null;
        return get().walletStates[addr] ?? null;
      },
    }),
    {
      name: 'fbit-staking-v4',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : (undefined as any)
      ),
      // Only persist the data that must survive page refreshes
      partialize: (state) => ({
        walletStates: state.walletStates,
        platformStats: state.platformStats,
        selectedNetwork: state.selectedNetwork,
      }),
      // Merge persisted platformStats with BASE defaults so new fields (e.g. totalBurned)
      // are always present even when loading a pre-burn-halving saved state.
      merge: (persisted: any, current) => {
        const ps = (persisted as any)?.platformStats ?? {};
        // Migrate: if persisted burnBps is the old 25% default, reset to 10%
        if (ps.burnBps === 2500) ps.burnBps = 1000;
        // Migrate: if persisted effectiveAPY is old 100% default (10000), reset to 60% (6000)
        if (ps.effectiveAPY === 10000) ps.effectiveAPY = 6000;
        return {
          ...current,
          ...(persisted ?? {}),
          platformStats: { ...BASE_PLATFORM_STATS, ...ps },
        };
      },
    }
  )
);
