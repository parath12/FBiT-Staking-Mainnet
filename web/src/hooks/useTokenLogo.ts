'use client';

/**
 * useTokenLogo
 *
 * Fetches the token logo from the source the smart contract uses:
 *   • Solana  → Metaplex DAS API  (reads on-chain metadata URI → image)
 *              then falls back to DexScreener info.imageUrl
 *   • Polygon → DexScreener info.imageUrl
 *              then falls back to Trust Wallet asset repo
 *
 * Returns null when the token address is not set or the logo cannot be fetched.
 */

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { NETWORK_CONFIG } from '@/lib/config';

export interface TokenLogoState {
  logoUrl: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  isLoading: boolean;
  source: 'metaplex' | 'dexscreener' | 'trustwallet' | 'none' | null;
}

function isPlaceholder(addr: string) {
  return !addr || addr.length < 10;
}

// ─── Solana: Metaplex DAS API ─────────────────────────────────────────────────
async function fetchSolanaMetaplexLogo(
  rpcUrl: string,
  mintAddress: string
): Promise<{ logoUrl: string | null; name: string | null; symbol: string | null }> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'fbit-logo',
      method: 'getAsset',
      params: { id: mintAddress },
    }),
  });

  if (!res.ok) return { logoUrl: null, name: null, symbol: null };
  const data = await res.json();
  const result = data?.result;

  const name   = result?.content?.metadata?.name   ?? null;
  const symbol = result?.content?.metadata?.symbol ?? null;

  // Direct image link in DAS response
  const directImage = result?.content?.links?.image ?? null;
  if (directImage && directImage.startsWith('http')) {
    return { logoUrl: directImage, name, symbol };
  }

  // Fallback: fetch the metadata URI JSON and read `image`
  const jsonUri = result?.content?.json_uri ?? null;
  if (jsonUri && jsonUri.startsWith('http')) {
    try {
      const metaRes = await fetch(jsonUri, { cache: 'force-cache' });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta?.image && meta.image.startsWith('http')) {
          return { logoUrl: meta.image, name: meta.name ?? name, symbol: meta.symbol ?? symbol };
        }
      }
    } catch {
      // ignore
    }
  }

  return { logoUrl: null, name, symbol };
}

// ─── DexScreener: info.imageUrl (both chains) ────────────────────────────────
async function fetchDexScreenerLogo(
  tokenAddress: string
): Promise<{ logoUrl: string | null; name: string | null; symbol: string | null }> {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
    { cache: 'no-store' }
  );
  if (!res.ok) return { logoUrl: null, name: null, symbol: null };
  const data = await res.json();

  // DexScreener returns info.imageUrl on the pair level
  const pair = data?.pairs?.[0];
  const logoUrl = pair?.info?.imageUrl ?? null;
  const name    = pair?.baseToken?.name   ?? null;
  const symbol  = pair?.baseToken?.symbol ?? null;

  return { logoUrl, name, symbol };
}

// ─── Trust Wallet GitHub (Polygon/EVM fallback) ───────────────────────────────
async function fetchTrustWalletLogo(
  tokenAddress: string,
  chain: 'polygon' | 'ethereum' = 'polygon'
): Promise<string | null> {
  // Trust Wallet requires EIP-55 checksum address; do a basic HEAD check
  const url = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain}/assets/${tokenAddress}/logo.png`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useTokenLogo(): TokenLogoState {
  const { selectedNetwork } = useAppStore();
  const [state, setState] = useState<TokenLogoState>({
    logoUrl: null,
    tokenName: null,
    tokenSymbol: null,
    isLoading: true,
    source: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel any in-flight fetch when network changes
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState({ logoUrl: null, tokenName: null, tokenSymbol: null, isLoading: true, source: null });

    const config = NETWORK_CONFIG[selectedNetwork];
    const tokenAddress = config.stakeTokenAddress;

    if (isPlaceholder(tokenAddress)) {
      setState(s => ({ ...s, isLoading: false, source: 'none' }));
      return;
    }

    (async () => {
      try {
        if (selectedNetwork === 'solana') {
          // 1. Metaplex DAS (on-chain smart contract metadata)
          const { logoUrl, name, symbol } = await fetchSolanaMetaplexLogo(config.rpcUrl, tokenAddress);
          if (logoUrl) {
            setState({ logoUrl, tokenName: name, tokenSymbol: symbol, isLoading: false, source: 'metaplex' });
            return;
          }

          // 2. DexScreener fallback
          const ds = await fetchDexScreenerLogo(tokenAddress);
          if (ds.logoUrl) {
            setState({ logoUrl: ds.logoUrl, tokenName: ds.name, tokenSymbol: ds.symbol, isLoading: false, source: 'dexscreener' });
            return;
          }
        } else {
          // Polygon: DexScreener first
          const ds = await fetchDexScreenerLogo(tokenAddress);
          if (ds.logoUrl) {
            setState({ logoUrl: ds.logoUrl, tokenName: ds.name, tokenSymbol: ds.symbol, isLoading: false, source: 'dexscreener' });
            return;
          }

          // Trust Wallet fallback
          const tw = await fetchTrustWalletLogo(tokenAddress);
          if (tw) {
            setState({ logoUrl: tw, tokenName: null, tokenSymbol: null, isLoading: false, source: 'trustwallet' });
            return;
          }
        }

        // Nothing found
        setState(s => ({ ...s, isLoading: false, source: 'none' }));
      } catch {
        setState(s => ({ ...s, isLoading: false, source: 'none' }));
      }
    })();
  }, [selectedNetwork]);

  return state;
}
