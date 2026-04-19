'use client';

import React, { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/lib/store';
import { useWallet } from '@/context/WalletContext';
import { getExplorerTxUrl } from '@/lib/config';
import { formatNumber } from '@/lib/utils';
import type { TxRecord } from '@/types';

// ─── Filter types ──────────────────────────────────────────────────────────────
type FilterType = 'all' | 'stake' | 'unstake' | 'claim' | 'compound' | 'referral' | 'team_bonus' | 'admin';

const FILTERS: { id: FilterType; label: string; icon: string }[] = [
  { id: 'all',        label: 'All',         icon: '◈' },
  { id: 'stake',      label: 'Stake',       icon: '↓' },
  { id: 'unstake',    label: 'Unstake',     icon: '↩' },
  { id: 'claim',      label: 'Claim',       icon: '↑' },
  { id: 'compound',   label: 'Compound',    icon: '↻' },
  { id: 'referral',   label: 'Referral',    icon: '◎' },
  { id: 'team_bonus', label: 'Team Bonus',  icon: '⬡' },
  { id: 'admin',      label: 'Admin',       icon: '⚙' },
];

// ─── Colors per type ───────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { icon: string; bg: string; text: string; border: string }> = {
  stake:      { icon: '↓', bg: 'bg-brand-500/20',    text: 'text-brand-400',    border: 'border-brand-500/30' },
  unstake:    { icon: '↩', bg: 'bg-accent-rose/20',  text: 'text-accent-rose',  border: 'border-accent-rose/30' },
  claim:      { icon: '↑', bg: 'bg-accent-cyan/20',  text: 'text-accent-cyan',  border: 'border-accent-cyan/30' },
  compound:   { icon: '↻', bg: 'bg-accent-purple/20',text: 'text-accent-purple',border: 'border-accent-purple/30' },
  referral:   { icon: '◎', bg: 'bg-accent-amber/20', text: 'text-accent-amber', border: 'border-accent-amber/30' },
  team_bonus: { icon: '⬡', bg: 'bg-emerald-500/20',  text: 'text-emerald-400',  border: 'border-emerald-500/30' },
  admin:      { icon: '⚙', bg: 'bg-slate-500/20',    text: 'text-slate-400',    border: 'border-slate-500/30' },
};

function typeLabel(type: string): string {
  return {
    stake:      'Staked',
    unstake:    'Unstaked',
    claim:      'Claimed',
    compound:   'Compounded',
    referral:   'Referral Reward',
    team_bonus: 'Team Bonus',
    admin:      'Admin',
  }[type] ?? type;
}

function formatDate(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass-card">
      <p className={`text-xs font-display uppercase tracking-wider mb-1 ${color}`}>{label}</p>
      <p className="font-display font-bold text-xl sm:text-2xl">{value}</p>
      {sub && <p className="text-text-secondary text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Single activity row ───────────────────────────────────────────────────────
function ActivityRow({ tx, network }: { tx: TxRecord; network: string }) {
  const cfg = TYPE_CONFIG[tx.type] ?? TYPE_CONFIG.admin;
  const { date, time } = formatDate(tx.timestamp);
  const explorerUrl = getExplorerTxUrl(tx.network, tx.txHash);

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-surface-800/40 border border-white/5 hover:border-white/10 transition-all">
      {/* Icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
        {cfg.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-display font-semibold ${cfg.text}`}>{typeLabel(tx.type)}</span>
          {tx.referralLevel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-amber/10 text-accent-amber border border-accent-amber/20 font-mono">
              Level {tx.referralLevel}
            </span>
          )}
          {tx.bonusPercent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              +{tx.bonusPercent}%
            </span>
          )}
          {tx.status === 'failed' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-rose/10 text-accent-rose border border-accent-rose/20">Failed</span>
          )}
        </div>
        <p className="text-text-muted text-xs mt-0.5 truncate">{tx.label}</p>
      </div>

      {/* Amount */}
      {tx.amount > 0 && (
        <div className="text-right shrink-0">
          <p className={`font-mono text-sm font-semibold ${cfg.text}`}>
            {tx.type === 'unstake' ? '-' : '+'}{formatNumber(tx.amount)}
          </p>
          <p className="text-text-muted text-[10px]">FBiT</p>
        </div>
      )}

      {/* Date & Tx link */}
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-text-secondary text-xs">{date}</p>
        <p className="text-text-muted text-[10px]">{time}</p>
      </div>

      {/* Explorer link */}
      {tx.txHash && tx.txHash !== 'local' && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View on explorer"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-text-muted hover:text-brand-400 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function HistoryPanel() {
  const { address } = useWallet();
  const { getWalletData, selectedNetwork, platformStats } = useAppStore();
  const walletData = getWalletData();
  const localTxs: TxRecord[] = walletData?.transactions ?? [];

  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [onChainTxs, setOnChainTxs] = useState<TxRecord[]>([]);
  const [isFetchingChain, setIsFetchingChain] = useState(false);

  const handleRefreshFromChain = useCallback(async () => {
    if (!address) return;
    setIsFetchingChain(true);
    try {
      const [polygonMod, solanaMod] = await Promise.allSettled([
        import('@/lib/contracts/polygon').then(m => m.polygonGetOnChainHistory(address)),
        import('@/lib/contracts/solana').then(m => m.solanaGetOnChainHistory(address)),
      ]);
      const polyRecs  = polygonMod.status === 'fulfilled' ? polygonMod.value : [];
      const solRecs   = solanaMod.status === 'fulfilled'  ? solanaMod.value  : [];
      const fetched   = [...polyRecs, ...solRecs];
      setOnChainTxs(fetched);
      toast.success(`Fetched ${fetched.length} on-chain records`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to fetch on-chain history');
    } finally {
      setIsFetchingChain(false);
    }
  }, [address]);

  // Merge local + on-chain, deduplicate by txHash
  const transactions: TxRecord[] = useMemo(() => {
    const seen = new Set<string>();
    const merged: TxRecord[] = [];
    for (const tx of [...onChainTxs, ...localTxs]) {
      const key = tx.txHash && tx.txHash !== 'local' ? tx.txHash : tx.id;
      if (!seen.has(String(key))) {
        seen.add(String(key));
        merged.push(tx);
      }
    }
    return merged.sort((a, b) => b.timestamp - a.timestamp);
  }, [onChainTxs, localTxs]);

  // ── Summary stats ────────────────────────────────────────────────────────────
  const totalStaked    = transactions.filter(t => t.type === 'stake').reduce((a, t) => a + t.amount, 0);
  const totalUnstaked  = transactions.filter(t => t.type === 'unstake').reduce((a, t) => a + t.amount, 0);
  const totalClaimed   = transactions.filter(t => t.type === 'claim').reduce((a, t) => a + t.amount, 0);
  const totalCompound  = transactions.filter(t => t.type === 'compound').reduce((a, t) => a + t.amount, 0);
  const totalReferral  = transactions.filter(t => t.type === 'referral').reduce((a, t) => a + t.amount, 0);
  const totalTeamBonus = transactions.filter(t => t.type === 'team_bonus').reduce((a, t) => a + t.amount, 0);

  // Count per type for badges
  const countByType = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(t => { map[t.type] = (map[t.type] ?? 0) + 1; });
    return map;
  }, [transactions]);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = filter === 'all' ? transactions : transactions.filter(t => t.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.label.toLowerCase().includes(q) ||
        t.txHash.toLowerCase().includes(q) ||
        typeLabel(t.type).toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions, filter, search]);

  // ── Group by date ─────────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, TxRecord[]>();
    filtered.forEach(tx => {
      const key = new Date(tx.timestamp).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    });
    return map;
  }, [filtered]);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-linear-to-br from-brand-500/20 to-accent-cyan/20 flex items-center justify-center mb-6 animate-float">
          <span className="text-4xl">📋</span>
        </div>
        <h2 className="font-display text-2xl font-bold mb-3">Activity History</h2>
        <p className="text-text-secondary max-w-md">
          Connect your wallet to view your complete staking activity history.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold">Activity History</h2>
          <p className="text-text-muted text-sm mt-1">
            Your complete staking activity — {transactions.length} total records
            {onChainTxs.length > 0 && (
              <span className="ml-2 text-brand-400">({onChainTxs.length} from chain)</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshFromChain}
          disabled={isFetchingChain}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-display font-semibold border border-brand-500/30 text-brand-400 hover:bg-brand-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isFetchingChain ? (
            <>
              <span className="animate-spin text-xs">◌</span>
              Fetching...
            </>
          ) : (
            <>⟳ Refresh from Chain</>
          )}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Total Staked"    value={formatNumber(totalStaked)}    sub="FBiT staked"           color="text-brand-400" />
        <SummaryCard label="Total Unstaked"  value={formatNumber(totalUnstaked)}  sub="FBiT withdrawn"        color="text-accent-rose" />
        <SummaryCard label="Total Claimed"   value={formatNumber(totalClaimed)}   sub="FBiT rewards claimed"  color="text-accent-cyan" />
        <SummaryCard label="Total Compound"  value={formatNumber(totalCompound)}  sub="FBiT re-staked"        color="text-accent-purple" />
        <SummaryCard label="Referral Earned" value={formatNumber(totalReferral)}  sub="FBiT from referrals"   color="text-accent-amber" />
        <SummaryCard label="Team Bonus"      value={formatNumber(totalTeamBonus)} sub="FBiT bonus rewards"    color="text-emerald-400" />
      </div>

      {/* Platform snapshot */}
      <div className="glass-card bg-linear-to-r from-brand-500/5 to-accent-purple/5 border border-brand-500/10">
        <h3 className="font-display font-semibold text-sm mb-3 text-text-secondary uppercase tracking-wider">Platform Snapshot</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-text-muted text-xs">Total Burned 🔥</p>
            <p className="font-display font-bold text-accent-rose">{formatNumber(platformStats.totalBurned ?? 0)}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Reward Pool</p>
            <p className="font-display font-bold text-brand-400">{formatNumber(platformStats.rewardPoolBalance ?? 0)}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Current APY</p>
            <p className="font-display font-bold text-accent-amber">{Math.round((platformStats.effectiveAPY ?? 6000) / 100)}%</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Burn Rate</p>
            <p className="font-display font-bold text-accent-rose">{((platformStats.burnBps ?? 1000) / 100).toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search activity..."
            className="input-field w-full pl-8 text-sm py-2"
          />
        </div>

        {/* Filter tabs — scrollable on mobile */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 flex-wrap">
          {FILTERS.map(f => {
            const count = f.id === 'all' ? transactions.length : (countByType[f.id] ?? 0);
            if (f.id !== 'all' && count === 0) return null;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-medium whitespace-nowrap transition-all border ${
                  filter === f.id
                    ? 'bg-brand-500/15 text-brand-400 border-brand-500/30'
                    : 'bg-surface-800/60 text-text-muted border-white/5 hover:border-white/10 hover:text-text-secondary'
                }`}
              >
                <span>{f.icon}</span>
                {f.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  filter === f.id ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-700 text-text-muted'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Activity list */}
      {transactions.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4 opacity-20">📋</div>
          <p className="font-display font-semibold text-lg text-text-secondary">No activity yet</p>
          <p className="text-text-muted text-sm mt-1">Stake FBiT tokens to start building your history</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3 opacity-20">🔍</div>
          <p className="text-text-muted text-sm">No results for this filter</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([date, txs]) => (
            <div key={date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-[11px] font-display text-text-muted px-2">{date}</span>
                <div className="h-px flex-1 bg-white/5" />
              </div>
              <div className="space-y-2">
                {txs.map(tx => (
                  <ActivityRow key={tx.id} tx={tx} network={selectedNetwork} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer note */}
      {transactions.length > 0 && (
        <p className="text-center text-text-muted text-xs pb-2">
          Showing {filtered.length} of {transactions.length} records
          {onChainTxs.length > 0
            ? ` · ${onChainTxs.length} fetched from blockchain`
            : ' · Click "Refresh from Chain" to load on-chain history'}
        </p>
      )}
    </div>
  );
}
