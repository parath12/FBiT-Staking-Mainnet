import { LOCK_PERIOD, TEAM_TARGET_TIERS, CLAIM_COOLDOWN_SECONDS, TeamTargetTier } from '@/types';

export const shortenAddress = (address: string, chars = 4): string => {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
};

export const formatNumber = (num: number, decimals = 2): string => {
  if (num == null || Number.isNaN(num)) return '0.00';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(decimals)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(decimals)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(decimals)}K`;
  return num.toFixed(decimals);
};

export const formatTokenAmount = (amount: number, decimals: number): number => {
  return amount / Math.pow(10, decimals);
};

export const toTokenAmount = (amount: number, decimals: number): number => {
  return amount * Math.pow(10, decimals);
};

export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getTimeRemaining = (unlockAt: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const diff = unlockAt - now;

  if (diff <= 0) return 'Unlocked';

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days > 365) return `${Math.floor(days / 365)}y ${days % 365}d`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const calculatePendingReward = (
  amount: number,
  apy: number,
  lastClaimAt: number
): number => {
  const now = Math.floor(Date.now() / 1000);
  // Match contract: reward accrues per completed 12h interval
  const intervals = Math.floor((now - lastClaimAt) / 43200);
  return (amount * (apy / 10000) * intervals) / 730;
};

export const getLockPeriodInfo = (_index?: number) => {
  return LOCK_PERIOD;
};

export const generateReferralLink = (address: string): string => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}?ref=${address}`;
};

export const getReferrerFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('ref');
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ===== DAILY CLAIM HELPERS =====

/** Returns true if 12 hours have passed since lastClaimAt */
export const canClaimRewards = (lastClaimAt: number): boolean => {
  const now = Math.floor(Date.now() / 1000);
  return now - lastClaimAt >= CLAIM_COOLDOWN_SECONDS;
};

/** Returns seconds remaining until next claim is allowed (0 if claimable now) */
export const secondsUntilNextClaim = (lastClaimAt: number): number => {
  const now = Math.floor(Date.now() / 1000);
  const diff = CLAIM_COOLDOWN_SECONDS - (now - lastClaimAt);
  return Math.max(0, diff);
};

/** Human-readable countdown to next claim, e.g. "18h 34m" or "Ready" */
export const getNextClaimLabel = (lastClaimAt: number): string => {
  const secs = secondsUntilNextClaim(lastClaimAt);
  if (secs === 0) return 'Ready';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

/** Reward per 12-hour interval for a given stake */
export const getDailyReward = (amount: number, apy: number): number => {
  // Returns per-interval (12h) reward — used for display as "per interval"
  return (amount * (apy / 10000)) / 730;
};

// ===== TEAM TARGET BONUS HELPERS =====

/** Returns the highest tier a user qualifies for, or null if none */
export const getTeamTargetTier = (_teamSize: number, teamTotalStaked: number): TeamTargetTier | null => {
  let current: TeamTargetTier | null = null;
  for (const tier of TEAM_TARGET_TIERS) {
    if (teamTotalStaked >= tier.minTeamStaked) {
      current = tier;
    }
  }
  return current;
};

/** Returns the next tier the user can unlock, or null if already at max */
export const getNextTeamTargetTier = (_teamSize: number, teamTotalStaked: number): TeamTargetTier | null => {
  for (const tier of TEAM_TARGET_TIERS) {
    if (teamTotalStaked < tier.minTeamStaked) {
      return tier;
    }
  }
  return null;
};
