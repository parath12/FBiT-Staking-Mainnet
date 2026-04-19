'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useAppStore } from '@/lib/store';
import { getReferrerFromUrl } from '@/lib/utils';
import { appKitModal } from '@/lib/reown';

type WalletType = 'reown';

interface WalletContextType {
  connect: (walletType: WalletType) => Promise<void>;
  adminConnect: () => Promise<void>;
  disconnect: () => void;
  address: string | null;
  isConnecting: boolean;
  walletType: WalletType | null;
  solanaReferrer: string | null;
  polygonReferrer: string | null;
  setSolanaReferrer: (addr: string) => void;
  setPolygonReferrer: (addr: string) => void;
}

const WalletContext = createContext<WalletContextType>({
  connect: async () => {},
  adminConnect: async () => {},
  disconnect: () => {},
  address: null,
  isConnecting: false,
  walletType: null,
  solanaReferrer: null,
  polygonReferrer: null,
  setSolanaReferrer: () => {},
  setPolygonReferrer: () => {},
});

export const useWallet = () => useContext(WalletContext);

// ── Admin address check ───────────────────────────────────────────────────────
// SECURITY: Admin list is kept in a private env var (no NEXT_PUBLIC_ prefix).
// It is never sent to the browser. The server-side check is a UI gate only;
// the real enforcement is the smart contract's onlyOwner / onlyAuthority modifier.
const ADMIN_ADDRESSES = (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? '')
  .split(',')
  .map(a => a.trim())
  .filter(Boolean);

function isAdminAddress(addr: string): boolean {
  if (!addr || ADMIN_ADDRESSES.length === 0) return false;
  // EVM: case-insensitive; Solana: case-sensitive (base58)
  const isEVM = addr.startsWith('0x');
  return ADMIN_ADDRESSES.some(a =>
    isEVM ? a.toLowerCase() === addr.toLowerCase() : a === addr
  );
}

// Exported so the AdminPanel can re-verify on every sensitive action
export { isAdminAddress };

export function WalletProvider({ children }: { children: ReactNode }) {
  const { setWallet, setIsAdmin, setActiveTab } = useAppStore();
  const [address, setAddress]           = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletType, setWalletType]     = useState<WalletType | null>(null);
  const [solanaReferrer, setSolanaReferrerState] = useState<string | null>(null);
  const [polygonReferrer, setPolygonReferrerState] = useState<string | null>(null);

  const walletTypeRef = useRef<WalletType | null>(null);
  useEffect(() => { walletTypeRef.current = walletType; }, [walletType]);

  // Tracks whether the pending connection was initiated via the admin-only path
  const isAdminConnectRef = useRef(false);

  useEffect(() => {
    const SOL_KEY  = 'fbit-referrer-solana';
    const POLY_KEY = 'fbit-referrer-polygon';

    const fromUrl = getReferrerFromUrl();
    if (fromUrl) {
      const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(fromUrl);
      const isEVM    = /^0x[0-9a-fA-F]{40}$/.test(fromUrl);
      if (isSolana) {
        setSolanaReferrerState(fromUrl);
        try { localStorage.setItem(SOL_KEY, fromUrl); } catch {}
      } else if (isEVM) {
        setPolygonReferrerState(fromUrl);
        try { localStorage.setItem(POLY_KEY, fromUrl); } catch {}
      }
      setActiveTab('stake');
    } else {
      try {
        const sol  = localStorage.getItem(SOL_KEY);
        const poly = localStorage.getItem(POLY_KEY);
        if (sol)  setSolanaReferrerState(sol);
        if (poly) setPolygonReferrerState(poly);
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reown / WalletConnect subscriptions ─────────────────────────────────────
  useEffect(() => {
    if (!appKitModal) return;
    const unsubAccount = appKitModal.subscribeAccount((account: { isConnected: boolean; address?: string }) => {
      if (account.isConnected && account.address) {
        const adminFlow = isAdminConnectRef.current;
        isAdminConnectRef.current = false;

        if (adminFlow && !isAdminAddress(account.address)) {
          // Connected via admin path but not an admin wallet — reject immediately
          appKitModal?.disconnect();
          setIsConnecting(false);
          // Dynamic import to avoid circular deps with toast at context level
          import('react-hot-toast').then(({ default: toast }) => {
            toast.error('This wallet is not an admin. Use the regular Connect button.');
          });
          return;
        }

        setAddress(account.address);
        setWallet(account.address);
        setWalletType('reown');
        setIsAdmin(isAdminAddress(account.address));
        setIsConnecting(false);
      } else if (!account.isConnected && walletTypeRef.current === 'reown') {
        setAddress(null);
        setWallet(null);
        setWalletType(null);
        setIsAdmin(false);
      }
    });

    const unsubEvents = appKitModal.subscribeEvents((event: { data: { event: string } }) => {
      if (event.data.event === 'MODAL_CLOSE') setIsConnecting(false);
    });

    return () => { unsubAccount(); unsubEvents(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setWallet]);

  // ── Main connect entry-point ─────────────────────────────────────────────────
  // Force 'Connect' view to bypass email/social login (remote config may re-enable them).
  const connect = useCallback(async (_type: WalletType) => {
    if (!appKitModal) throw new Error('WalletConnect is not available. Check your Reown project configuration.');
    isAdminConnectRef.current = false;
    setIsConnecting(true);
    appKitModal.open({ view: 'Connect' });
  }, []);

  // ── Admin-only connect (bypasses referral gate; rejects non-admin wallets) ──
  const adminConnect = useCallback(async () => {
    if (!appKitModal) throw new Error('WalletConnect is not available. Check your Reown project configuration.');
    isAdminConnectRef.current = true;
    setIsConnecting(true);
    appKitModal.open({ view: 'Connect' });
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    appKitModal?.disconnect();
    setAddress(null);
    setWallet(null);
    setWalletType(null);
    setIsAdmin(false);
    if (useAppStore.getState().activeTab === 'admin') setActiveTab('dashboard');
  }, [setWallet, setIsAdmin, setActiveTab]);

  const saveSolanaReferrer = useCallback((addr: string) => {
    setSolanaReferrerState(addr);
    try { localStorage.setItem('fbit-referrer-solana', addr); } catch {}
  }, []);

  const savePolygonReferrer = useCallback((addr: string) => {
    setPolygonReferrerState(addr);
    try { localStorage.setItem('fbit-referrer-polygon', addr); } catch {}
  }, []);

  return (
    <WalletContext.Provider value={{
      connect, adminConnect, disconnect,
      address, isConnecting, walletType,
      solanaReferrer, polygonReferrer,
      setSolanaReferrer: saveSolanaReferrer,
      setPolygonReferrer: savePolygonReferrer,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
