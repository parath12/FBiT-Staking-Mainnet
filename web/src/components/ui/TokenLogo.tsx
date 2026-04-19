'use client';

import React, { useState } from 'react';
import { useTokenLogo } from '@/hooks/useTokenLogo';

// Size map: tailwind classes for width/height
const SIZE: Record<string, { box: string; text: string; pulse: string }> = {
  xs: { box: 'w-5 h-5',   text: 'text-[9px]',  pulse: 'w-2.5 h-2.5' },
  sm: { box: 'w-7 h-7',   text: 'text-[11px]', pulse: 'w-3 h-3'   },
  md: { box: 'w-9 h-9',   text: 'text-sm',     pulse: 'w-3.5 h-3.5' },
  lg: { box: 'w-12 h-12', text: 'text-lg',     pulse: 'w-4 h-4'   },
  xl: { box: 'w-16 h-16', text: 'text-2xl',    pulse: 'w-5 h-5'   },
};

// Branded SVG fallback — used when no on-chain / registry logo is found
function FBiTFallback({ size }: { size: string }) {
  const s = SIZE[size] ?? SIZE.md;
  return (
    <div className={`${s.box} rounded-xl bg-gradient-to-br from-brand-500 to-accent-cyan flex items-center justify-center shrink-0`}>
      <span className={`font-display font-extrabold text-surface-900 ${s.text} leading-none`}>F</span>
    </div>
  );
}

interface TokenLogoProps {
  /** Override URL — skips the hook fetch entirely (useful when parent already has the URL) */
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Show the animated live-dot indicator */
  showLiveDot?: boolean;
  /** Round as circle (default: rounded-xl) */
  circle?: boolean;
  className?: string;
}

/**
 * TokenLogo
 *
 * Displays the FBiT token logo sourced from the smart contract's on-chain
 * metadata (Metaplex DAS for Solana, Trust Wallet / DexScreener for Polygon).
 *
 * Falls back gracefully to a branded "F" badge when no logo is available.
 */
export default function TokenLogo({
  src,
  size = 'md',
  showLiveDot = false,
  circle = false,
  className = '',
}: TokenLogoProps) {
  // Hardcoded FBiT logo — IPFS hosted
  const FBIT_LOGO = 'https://ipfs.io/ipfs/QmNvMhxJqSVQ3R6AusZwL79Qy125rX5ND1sEJ4bcxknYJ4';

  // Only invoke the hook when no external src is provided
  const hookData = useTokenLogo();
  const logoUrl = src !== undefined ? src : (hookData.logoUrl ?? FBIT_LOGO);

  const [imgError, setImgError] = useState(false);
  const s = SIZE[size] ?? SIZE.md;
  const roundClass = circle ? 'rounded-full' : 'rounded-xl';

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {logoUrl && !imgError ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={logoUrl}
          alt="FBiT token logo"
          className={`${s.box} ${roundClass} object-cover`}
          onError={() => setImgError(true)}
        />
      ) : (
        <FBiTFallback size={size} />
      )}

      {/* Optional live-dot overlay */}
      {showLiveDot && (
        <span
          className={`absolute -top-0.5 -right-0.5 ${s.pulse} rounded-full bg-brand-500 border-2 border-surface-900 animate-pulse`}
        />
      )}
    </div>
  );
}
