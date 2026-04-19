'use client';

import React from 'react';
import { useAppStore } from '@/lib/store';
import { NETWORK_CONFIG } from '@/lib/config';

function EnvRow({ label, value, required = true }: { label: string; value: string; required?: boolean }) {
  const isSet = Boolean(value) && value.length > 5 && !value.toUpperCase().startsWith('YOUR_');
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="font-mono text-xs text-text-muted">{label}</span>
      <span className={`text-xs font-semibold flex items-center gap-1.5 ${isSet ? 'text-brand-400' : required ? 'text-accent-rose' : 'text-accent-amber'}`}>
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${isSet ? 'bg-brand-400' : required ? 'bg-accent-rose' : 'bg-accent-amber'}`} />
        {isSet ? `✓ ${value.slice(0, 12)}…` : required ? '✗ Not set' : '○ Optional'}
      </span>
    </div>
  );
}

export default function ContractSetupNotice() {
  const { selectedNetwork } = useAppStore();
  const cfg = NETWORK_CONFIG[selectedNetwork];

  const contractSet = Boolean(cfg.contractAddress) && cfg.contractAddress.length > 5
    && !cfg.contractAddress.toUpperCase().startsWith('YOUR_');
  const tokenSet    = Boolean(cfg.stakeTokenAddress) && cfg.stakeTokenAddress.length > 5
    && !cfg.stakeTokenAddress.toUpperCase().startsWith('YOUR_');

  if (contractSet && tokenSet) return null;

  const isSolana = selectedNetwork === 'solana';

  return (
    <div className="rounded-2xl border border-accent-amber/30 bg-accent-amber/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-accent-amber text-lg">⚠</span>
        <div>
          <p className="font-display font-semibold text-accent-amber text-sm">
            {isSolana ? 'Solana' : 'Polygon'} Contract Not Configured
          </p>
          <p className="text-text-muted text-xs mt-0.5">
            Fill in the missing values in <span className="font-mono text-accent-amber">.env.local</span> to enable on-chain transactions.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-surface-900/60 border border-white/5 px-3 py-2 space-y-0.5">
        {isSolana ? (
          <>
            <EnvRow label="NEXT_PUBLIC_SOLANA_PROGRAM_ID"        value={cfg.contractAddress} />
            <EnvRow label="NEXT_PUBLIC_SOLANA_STAKE_TOKEN_MINT"  value={cfg.stakeTokenAddress} />
            <EnvRow label="NEXT_PUBLIC_SOLANA_REWARD_TOKEN_MINT" value={cfg.rewardTokenAddress} />
            <EnvRow label="NEXT_PUBLIC_SOLANA_STAKE_VAULT"       value={cfg.stakeVaultAddress ?? ''} required={false} />
            <EnvRow label="NEXT_PUBLIC_SOLANA_REWARD_VAULT"      value={cfg.rewardVaultAddress ?? ''} required={false} />
          </>
        ) : (
          <>
            <EnvRow label="NEXT_PUBLIC_POLYGON_CONTRACT_ADDRESS" value={cfg.contractAddress} />
            <EnvRow label="NEXT_PUBLIC_POLYGON_STAKE_TOKEN"      value={cfg.stakeTokenAddress} />
            <EnvRow label="NEXT_PUBLIC_POLYGON_REWARD_TOKEN"     value={cfg.rewardTokenAddress} />
          </>
        )}
      </div>

      <div className="text-xs text-text-muted space-y-0.5">
        <p className="text-brand-400 font-medium">Steps to go live:</p>
        {isSolana ? (
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li>Deploy the Anchor program → copy Program ID into <span className="font-mono">NEXT_PUBLIC_SOLANA_PROGRAM_ID</span></li>
            <li>Initialize the platform PDA (run <span className="font-mono">anchor deploy</span>)</li>
            <li>Vaults are auto-derived — optionally set them explicitly for custom setups</li>
            <li>Restart the dev server: <span className="font-mono">npm run dev</span></li>
          </ol>
        ) : (
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li>Deploy the FBiTStaking contract on Polygon Mainnet (chain 137)</li>
            <li>Copy the deployed address into <span className="font-mono">NEXT_PUBLIC_POLYGON_CONTRACT_ADDRESS</span></li>
            <li>Restart the dev server: <span className="font-mono">npm run dev</span></li>
          </ol>
        )}
      </div>
    </div>
  );
}
