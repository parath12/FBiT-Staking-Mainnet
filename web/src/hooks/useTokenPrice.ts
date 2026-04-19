'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { NETWORK_CONFIG } from '@/lib/config';

const REFRESH_INTERVAL_MS = 30_000; // 30 s

export interface DexPair {
  dexId: string;
  pairAddress: string;
  quoteSymbol: string;
  priceUsd: string;
  priceChange24h: number;
  volume24h: number;
  liquidityUsd: number;
  txns24h: { buys: number; sells: number };
  url: string;
}

export interface TokenPriceData {
  pairs: DexPair[];
  logoUrl: string | null;
  lastUpdated: number | null;
  isLoading: boolean;
  error: string | null;
  source: 'geckoterminal' | 'mock';
}

// ── GeckoTerminal network IDs ─────────────────────────────────────────────────
const GECKO_NETWORK: Record<string, string> = {
  solana:  'solana',
  polygon: 'polygon_pos',
};

// ── Hardcoded FBiT pool addresses on Solana (always fetched first) ────────────
const FBIT_SOLANA_POOLS = [
  '8FNq5nb5sCV3BUThSbWY3byVos3z5LAWREbv8DUQq6HR',
  'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  '4sC7TFsmHodm4sfFFBcKXKbL1K2V5pav52zAiokufnQy',
];

// ── GeckoTerminal multi-pool fetch ────────────────────────────────────────────
async function fetchGeckoMultiPools(network: string, poolAddresses: string[]): Promise<DexPair[]> {
  const geckoNet  = GECKO_NETWORK[network] ?? network;
  const addresses = poolAddresses.join(',');
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/${geckoNet}/pools/multi/${addresses}?include=dex`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return parseGeckoPools(data, network);
}

// ── GeckoTerminal parsers ─────────────────────────────────────────────────────
function parseGeckoPools(data: any, network: string): DexPair[] {
  if (!data?.data?.length) return [];

  const dexNames: Record<string, string> = {};
  for (const inc of data.included ?? []) {
    if (inc.type === 'dex') dexNames[inc.id] = inc.attributes?.name ?? inc.id;
  }

  const geckoNet = GECKO_NETWORK[network] ?? network;

  return (data.data as any[])
    .filter((p: any) => p.attributes?.base_token_price_usd)
    .map((p: any): DexPair => {
      const attr     = p.attributes;
      const dexId    = p.relationships?.dex?.data?.id ?? 'Unknown';
      const poolAddr = attr?.address ?? p.id?.split('_').slice(1).join('_') ?? '';
      return {
        dexId:          dexNames[dexId] ?? dexId,
        pairAddress:    poolAddr,
        quoteSymbol:    (attr.name as string ?? '').split(' / ')[1] ?? 'USD',
        priceUsd:       String(attr.base_token_price_usd ?? '0'),
        priceChange24h: parseFloat(attr.price_change_percentage?.h24 ?? '0'),
        volume24h:      parseFloat(attr.volume_usd?.h24 ?? '0'),
        liquidityUsd:   parseFloat(attr.reserve_in_usd ?? '0'),
        txns24h: {
          buys:  Number(attr.transactions?.h24?.buys  ?? 0),
          sells: Number(attr.transactions?.h24?.sells ?? 0),
        },
        url: `https://www.geckoterminal.com/${geckoNet}/pools/${poolAddr}`,
      };
    })
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, 6);
}

function parseGeckoSearch(data: any, network: string): DexPair[] {
  if (!data?.data?.length) return [];
  const geckoNet = GECKO_NETWORK[network] ?? network;

  return (data.data as any[])
    .filter((p: any) => {
      const net = p.relationships?.network?.data?.id ?? '';
      return net === geckoNet && p.attributes?.base_token_price_usd;
    })
    .map((p: any): DexPair => {
      const attr     = p.attributes;
      const poolAddr = attr?.address ?? '';
      return {
        dexId:          attr.dex_id ?? attr.name?.split(' / ')[0] ?? 'DEX',
        pairAddress:    poolAddr,
        quoteSymbol:    (attr.name as string ?? '').split(' / ')[1] ?? 'USD',
        priceUsd:       String(attr.base_token_price_usd ?? '0'),
        priceChange24h: parseFloat(attr.price_change_percentage?.h24 ?? '0'),
        volume24h:      parseFloat(attr.volume_usd?.h24 ?? '0'),
        liquidityUsd:   parseFloat(attr.reserve_in_usd ?? '0'),
        txns24h: {
          buys:  Number(attr.transactions?.h24?.buys  ?? 0),
          sells: Number(attr.transactions?.h24?.sells ?? 0),
        },
        url: `https://www.geckoterminal.com/${geckoNet}/pools/${poolAddr}`,
      };
    })
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, 6);
}

async function fetchGeckoTokenLogo(network: string, tokenAddress: string): Promise<string | null> {
  try {
    const geckoNet = GECKO_NETWORK[network] ?? network;
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${geckoNet}/tokens/${tokenAddress}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const img = data?.data?.attributes?.image_url;
    return typeof img === 'string' && img.startsWith('http') ? img : null;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTokenPrice(): TokenPriceData & { refresh: () => void } {
  const { selectedNetwork } = useAppStore();
  const [state, setState] = useState<TokenPriceData>({
    pairs: [],
    logoUrl: null,
    lastUpdated: null,
    isLoading: true,
    error: null,
    source: 'mock',
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrice = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    const config       = NETWORK_CONFIG[selectedNetwork];
    const tokenAddress = config?.stakeTokenAddress ?? '';
    const geckoNet     = GECKO_NETWORK[selectedNetwork] ?? selectedNetwork;
    const hasAddress   = tokenAddress.length > 10;

    // ── 1. GeckoTerminal — hardcoded FBiT pool addresses (Solana) ───────────
    if (selectedNetwork === 'solana') {
      try {
        const pairs = await fetchGeckoMultiPools('solana', FBIT_SOLANA_POOLS);
        if (pairs.length > 0) {
          const logoUrl = hasAddress ? await fetchGeckoTokenLogo('solana', tokenAddress) : null;
          setState({ pairs, logoUrl, lastUpdated: Date.now(), isLoading: false, error: null, source: 'geckoterminal' });
          return;
        }
      } catch { /* fall through */ }
    }

    // ── 2. GeckoTerminal by token address ────────────────────────────────────
    if (hasAddress) {
      try {
        const [poolsRes, logoUrl] = await Promise.all([
          fetch(
            `https://api.geckoterminal.com/api/v2/networks/${geckoNet}/tokens/${tokenAddress}/pools` +
            `?page=1&include=dex`,
            { headers: { Accept: 'application/json' }, cache: 'no-store' }
          ),
          fetchGeckoTokenLogo(selectedNetwork, tokenAddress),
        ]);

        if (poolsRes.ok) {
          const data  = await poolsRes.json();
          const pairs = parseGeckoPools(data, selectedNetwork);
          if (pairs.length > 0) {
            setState({ pairs, logoUrl, lastUpdated: Date.now(), isLoading: false, error: null, source: 'geckoterminal' });
            return;
          }
        }
      } catch { /* fall through */ }
    }

    // ── 3. GeckoTerminal search by symbol "FBiT" ─────────────────────────────
    try {
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/search/pools?query=FBiT&network=${geckoNet}&page=1`,
        { headers: { Accept: 'application/json' }, cache: 'no-store' }
      );
      if (res.ok) {
        const data  = await res.json();
        const pairs = parseGeckoSearch(data, selectedNetwork);
        if (pairs.length > 0) {
          setState({ pairs, logoUrl: null, lastUpdated: Date.now(), isLoading: false, error: null, source: 'geckoterminal' });
          return;
        }
      }
    } catch { /* fall through */ }

    // ── All sources failed — show empty state ─────────────────────────────────
    setState(prev => ({ ...prev, pairs: [], logoUrl: null, isLoading: false, error: 'No price data available', source: 'mock' }));
  }, [selectedNetwork]);

  useEffect(() => {
    fetchPrice();
    timerRef.current = setInterval(fetchPrice, REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchPrice]);

  return { ...state, refresh: fetchPrice };
}
