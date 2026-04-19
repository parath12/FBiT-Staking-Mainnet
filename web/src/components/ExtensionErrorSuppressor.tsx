'use client';

/**
 * Suppresses unhandled errors thrown by browser extension scripts
 * (e.g. Phantom, MetaMask, OKX Wallet inpage.js) so they don't trigger the
 * Next.js dev-mode error overlay or Turbopack source-map resolver.
 *
 * Listeners are registered at module load time (not in useEffect) so no
 * extension errors slip through before the component mounts.
 */

function isExtensionSource(str: string): boolean {
  return str.includes('chrome-extension://') || str.includes('moz-extension://');
}

// Known harmless messages thrown by wallet extension content scripts
const EXTENSION_ERROR_MESSAGES = ['Origin not allowed', 'Extension context invalidated'];

function isExtensionError(reason: unknown): boolean {
  if (!reason) return false;
  const stack: string = (reason as any)?.stack ?? '';
  const message: string = (reason as any)?.message ?? String(reason);
  return (
    isExtensionSource(stack) ||
    EXTENSION_ERROR_MESSAGES.some((msg) => message.includes(msg))
  );
}

if (typeof window !== 'undefined') {
  // ── window error & unhandledrejection ──────────────────────────────────────
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      if (isExtensionSource(event.filename ?? '') || isExtensionError(event.error)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      if (isExtensionError(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  // ── console.error patch ────────────────────────────────────────────────────
  // Next.js Turbopack dev overlay intercepts console.error and tries to load
  // source maps for every stack frame — including chrome-extension:// URLs,
  // which it can't resolve (Unknown url scheme error). Patch console.error to
  // silently drop messages that originate from extension scripts.
  const _consoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const combined = args.map(a =>
      typeof a === 'string' ? a : (a as any)?.stack ?? (a as any)?.message ?? String(a)
    ).join(' ');

    if (isExtensionSource(combined) || EXTENSION_ERROR_MESSAGES.some(msg => combined.includes(msg))) {
      return; // drop silently
    }
    _consoleError(...args);
  };
}

export default function ExtensionErrorSuppressor() {
  return null;
}
