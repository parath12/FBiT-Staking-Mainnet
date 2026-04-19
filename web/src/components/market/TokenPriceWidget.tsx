'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { formatNumber } from '@/lib/utils';
import { useTokenPrice, DexPair } from '@/hooks/useTokenPrice';
import TokenLogo from '@/components/ui/TokenLogo';

const DEX_COLORS: Record<string, string> = {
  raydium:      'bg-[#7B5AFF]/20 text-[#7B5AFF]',
  orca:          'bg-[#08D9D6]/20 text-[#08D9D6]',
  meteora:      'bg-[#7CFFCB]/20 text-[#5BE8B5]',
  quickswap:    'bg-[#5F7AE8]/20 text-[#8AA4FF]',
  'uniswap v3': 'bg-[#FF007A]/20 text-[#FF007A]',
  sushiswap:    'bg-[#FA52A0]/20 text-[#FA52A0]',
};

function dexColor(dexId: string) {
  return DEX_COLORS[dexId.toLowerCase()] ?? 'bg-brand-500/20 text-brand-400';
}

function PriceChange({ pct }: { pct: number }) {
  const isPos = pct >= 0;
  return (
    <span className={`font-mono text-xs font-semibold ${isPos ? 'text-brand-400' : 'text-accent-rose'}`}>
      {isPos ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

function TxBadge({ buys, sells }: { buys: number; sells: number }) {
  const total = buys + sells || 1;
  const buyPct = (buys / total) * 100;
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (barRef.current) barRef.current.style.width = `${buyPct}%`;
  }, [buyPct]);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-surface-900 overflow-hidden flex">
        <div ref={barRef} className="h-full bg-brand-500/70 transition-all" />
      </div>
      <span className="text-[10px] text-text-muted font-mono whitespace-nowrap">
        {buys}B/{sells}S
      </span>
    </div>
  );
}

export default function TokenPriceWidget() {
  const { selectedNetwork } = useAppStore();
  const { pairs, logoUrl, lastUpdated, isLoading, source, refresh } = useTokenPrice();
  const [expanded, setExpanded] = useState(false);

  const bestPair: DexPair | undefined = pairs[0];
  const displayPairs = expanded ? pairs : pairs.slice(0, 3);

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div className="glass-card">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <TokenLogo src={logoUrl} size="md" showLiveDot />
          <div>
            <p className="font-display font-semibold text-sm leading-tight">FBiT Market Price</p>
            <p className="text-text-muted text-[11px]">
              {selectedNetwork === 'solana' ? 'Solana DEXs' : 'Polygon DEXs'}
            </p>
          </div>

          {/* Best price pill */}
          {bestPair && (
            <div className="flex items-center gap-2 pl-3 border-l border-white/5">
              <span className="font-display font-bold text-lg text-text-primary">
                ${Number(bestPair.priceUsd).toFixed(4)}
              </span>
              <PriceChange pct={bestPair.priceChange24h} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {source === 'geckoterminal' && (
            <span className="text-[10px] font-display px-2 py-1 rounded-md bg-brand-500/10 text-brand-400 border border-brand-500/20">
              GeckoTerminal
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            title="Refresh prices"
            className={`p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-all ${isLoading ? 'animate-spin opacity-50' : ''}`}
          >
            ↻
          </button>
          <span className="text-[10px] text-text-muted font-mono hidden sm:block">
            Updated {lastUpdatedLabel}
          </span>
          {/* Live dot */}
          <span className="flex items-center gap-1 text-[10px] text-brand-400 font-display">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse inline-block" />
            LIVE
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] md:grid-cols-[1fr_auto_auto_auto] lg:grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 sm:gap-x-4 px-3 mb-2 text-[10px] font-display uppercase tracking-wider text-text-muted">
        <span>DEX / Pair</span>
        <span className="text-right">Price (USD)</span>
        <span className="text-right hidden sm:block">24h Change</span>
        <span className="text-right hidden md:block">Volume 24h</span>
        <span className="text-right hidden lg:block">Liquidity</span>
      </div>

      {/* Pair rows */}
      <div className="space-y-1.5">
        {isLoading && pairs.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm animate-pulse">
            Fetching DEX prices…
          </div>
        ) : (
          displayPairs.map((pair) => (
            <a
              key={pair.pairAddress}
              href={pair.url}
              target="_blank"
              rel="noopener noreferrer"
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] md:grid-cols-[1fr_auto_auto_auto] lg:grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 sm:gap-x-4 items-center px-3 py-2.5 rounded-xl bg-surface-800/40 border border-white/5 transition-colors hover:bg-surface-800/70 cursor-pointer"
            >
              {/* DEX name + pair */}
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-display font-semibold shrink-0 ${dexColor(pair.dexId)}`}>
                  {pair.dexId}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-mono text-text-secondary truncate">
                    FBiT / {pair.quoteSymbol}
                  </span>
                  <TxBadge buys={pair.txns24h.buys} sells={pair.txns24h.sells} />
                </div>
              </div>

              {/* Price */}
              <span className="font-mono text-sm font-semibold text-text-primary text-right">
                ${Number(pair.priceUsd).toFixed(4)}
              </span>

              {/* 24h change */}
              <span className="hidden sm:flex justify-end">
                <PriceChange pct={pair.priceChange24h} />
              </span>

              {/* Volume */}
              <span className="font-mono text-xs text-text-secondary text-right hidden md:block">
                ${formatNumber(pair.volume24h)}
              </span>

              {/* Liquidity */}
              <span className="font-mono text-xs text-text-secondary text-right hidden lg:block">
                ${formatNumber(pair.liquidityUsd)}
              </span>
            </a>
          ))
        )}
      </div>

      {/* Show more / less */}
      {pairs.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full mt-3 pt-3 border-t border-white/5 text-xs text-text-muted hover:text-text-secondary font-display transition-colors"
        >
          {expanded ? 'Show less ▲' : `Show ${pairs.length - 3} more DEXs ▼`}
        </button>
      )}

    </div>
  );
}
