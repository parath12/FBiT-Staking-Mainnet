/**
 * Top-level security utilities for FBiT Staking.
 *
 * - RateLimiter: prevents burst transaction spam per action key
 * - sanitizeText: strips HTML/script tags from user-supplied strings
 * - isValidEVMAddress / isValidSolanaAddress: strict format checks
 * - isValidAmount: rejects NaN, negative, Infinity, and excessive precision
 */

// ── Rate Limiter ───────────────────────────────────────────────────────────────

interface RateLimiterOptions {
  /** Max calls allowed within `windowMs` */
  maxCalls: number;
  /** Rolling window in milliseconds */
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = { maxCalls: 3, windowMs: 30_000 };

/** Per-key timestamp log — lives for the duration of the browser session. */
const _callLog: Map<string, number[]> = new Map();

/**
 * Returns true if the action is allowed under the rate limit.
 * Call this before any on-chain write. If it returns false, show an error toast.
 *
 * @example
 * if (!checkRateLimit('stake')) { toast.error('Too many attempts. Wait 30 s.'); return; }
 */
export function checkRateLimit(
  key: string,
  opts: RateLimiterOptions = DEFAULT_OPTIONS
): boolean {
  const now = Date.now();
  const log = (_callLog.get(key) ?? []).filter(t => now - t < opts.windowMs);
  if (log.length >= opts.maxCalls) return false;
  log.push(now);
  _callLog.set(key, log);
  return true;
}

/** Reset the rate-limit log for a specific key (e.g. after a network switch). */
export function resetRateLimit(key: string): void {
  _callLog.delete(key);
}

// ── Input Sanitization ─────────────────────────────────────────────────────────

/**
 * Strip HTML tags and trim whitespace from a user-supplied string.
 * Prevents stored-XSS if any value is ever rendered via innerHTML.
 */
export function sanitizeText(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

// ── Address Validation ─────────────────────────────────────────────────────────

/** EVM address: 0x + 40 hex chars */
export function isValidEVMAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

/** Solana address: base58, 32–44 chars */
export function isValidSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

/** Accepts either EVM or Solana address */
export function isValidWalletAddress(addr: string): boolean {
  return isValidEVMAddress(addr) || isValidSolanaAddress(addr);
}

// ── Amount Validation ──────────────────────────────────────────────────────────

/**
 * Returns true when `amount` is a finite positive number with at most `maxDecimals` decimals.
 * Rejects: NaN, Infinity, zero, negative, and overly-precise floats.
 */
export function isValidAmount(amount: number, maxDecimals = 6): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const str = amount.toString();
  const dot = str.indexOf('.');
  if (dot === -1) return true;
  return str.length - dot - 1 <= maxDecimals;
}

// ── BPS Validation ─────────────────────────────────────────────────────────────

/** Basis points: integer 0–10000 */
export function isValidBps(bps: number): boolean {
  return Number.isInteger(bps) && bps >= 0 && bps <= 10_000;
}

/** Team bonus BPS: integer 1–1000 (max 10%) */
export function isValidBonusBps(bps: number): boolean {
  return Number.isInteger(bps) && bps >= 1 && bps <= 1_000;
}
