'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ProgressBar sets width imperatively to avoid JSX inline-style linter warnings
function ProgressBar({ pct, className }: { pct: number; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }, [pct]);
  return <div ref={ref} className={`h-full rounded-full transition-all duration-500 ${className}`} />;
}
import toast from 'react-hot-toast';
import { useWallet } from '@/context/WalletContext';
import { useAppStore } from '@/lib/store';
import { useContract } from '@/hooks/useContract';
import {
  formatNumber,
  copyToClipboard,
  generateReferralLink,
  getTeamTargetTier,
  getNextTeamTargetTier,
} from '@/lib/utils';
import { REFERRAL_LEVELS, TEAM_TARGET_TIERS } from '@/types';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export default function ReferralPanel() {
  const { address } = useWallet();
  const { getWalletData, selectedNetwork } = useAppStore();
  const contract = useContract();
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<'overview' | 'levels' | 'team' | 'history'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const prevReferralCount = useRef<number>(0);

  const syncReferralData = useCallback(async (showToast = false) => {
    if (!address) return;
    setIsRefreshing(true);
    try {
      await contract.syncUserData();
      setLastSyncAt(new Date());
    } catch {}
    setIsRefreshing(false);
  }, [address, contract]);

  // Initial sync + auto-poll every 30s
  useEffect(() => {
    if (!address) return;
    void syncReferralData();
    const id = setInterval(() => syncReferralData(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, selectedNetwork]);

  const walletData = getWalletData();
  const referralInfo = walletData?.referralInfo;
  const userAccount = walletData?.userAccount;
  const teamStats = walletData?.teamStats ?? { teamSize: 0, teamTotalStaked: 0 };

  // Detect new referrals and show toast
  useEffect(() => {
    const count = referralInfo?.totalReferrals ?? 0;
    if (prevReferralCount.current > 0 && count > prevReferralCount.current) {
      const diff = count - prevReferralCount.current;
      toast.success(`+${diff} new referral${diff > 1 ? 's' : ''}! Your network is growing.`);
    }
    prevReferralCount.current = count;
  }, [referralInfo?.totalReferrals]);

  const currentTier = getTeamTargetTier(teamStats.teamSize, teamStats.teamTotalStaked);
  const nextTier = getNextTeamTargetTier(teamStats.teamSize, teamStats.teamTotalStaked);

  const referralLink = address ? generateReferralLink(address) : '';
  const totalReferrals = referralInfo?.totalReferrals ?? 0;
  const totalRewards = userAccount?.totalReferralRewards ?? 0;
  const activeReferrals = referralInfo?.referrals.filter(r => r.stakedAmount > 0).length ?? 0;
  const pendingRewards = 0;

  const handleCopy = async () => {
    const ok = await copyToClipboard(referralLink);
    if (ok) {
      setCopied(true);
      toast.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefresh = async () => {
    await syncReferralData(true);
    toast.success('Referral data refreshed!');
  };

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-accent-purple/20 to-brand-500/20 flex items-center justify-center mb-4 animate-float">
          <span className="text-3xl">◎</span>
        </div>
        <h2 className="font-display text-2xl font-bold mb-2">Referral Network</h2>
        <p className="text-text-secondary max-w-sm">
          Connect your wallet to access your referral link and earn commissions across 10 levels.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Referral Link */}
      <div className="glass-card bg-linear-to-br from-accent-purple/5 to-brand-500/5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-lg">Your Referral Link</h3>
          <div className="flex items-center gap-2">
            {lastSyncAt && (
              <span className="text-[10px] text-text-muted font-mono">
                Updated {lastSyncAt.toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh referral data"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/5 transition-all disabled:opacity-40"
            >
              <span className={`text-sm ${isRefreshing ? 'animate-spin' : ''}`}>↻</span>
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 px-4 py-3 rounded-xl bg-surface-900/80 border border-white/5 font-mono text-sm text-text-secondary truncate">
            {referralLink}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className={`px-6 py-3 rounded-xl font-display font-semibold text-sm transition-all duration-300 whitespace-nowrap ${
              copied
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                : 'btn-primary'
            }`}
          >
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
        <p className="text-text-muted text-xs mt-3">
          Share this link to earn commissions when your referrals stake tokens — up to 10 levels deep!
          {isRefreshing && <span className="ml-2 text-brand-400 animate-pulse">Syncing...</span>}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Referrals', value: totalReferrals, color: 'gradient-text' },
          { label: 'Active',          value: activeReferrals, color: 'text-brand-400' },
          { label: 'Total Earned',    value: formatNumber(totalRewards), color: 'text-accent-cyan' },
          { label: 'Pending',         value: formatNumber(pendingRewards), color: 'text-accent-amber' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card text-center">
            <p className="text-text-muted text-xs font-display uppercase tracking-wider">{label}</p>
            <p className={`font-display font-bold text-2xl mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-800/50 border border-white/5 overflow-x-auto">
        {(['overview', 'levels', 'team', 'history'] as const).map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActiveView(tab)}
            className={`flex-1 py-2.5 rounded-lg font-display text-sm font-medium transition-all whitespace-nowrap px-3 ${
              activeView === tab
                ? 'bg-brand-500/10 text-brand-400 shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab === 'team' ? 'Team Bonus' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeView === 'overview' && (
        <div className="glass-card">
          <h3 className="font-display font-semibold mb-4">How It Works</h3>
          <div className="space-y-3">
            {[
              { n: 1, color: 'bg-brand-500/20 text-brand-400',   title: 'Share Your Link',     body: 'Copy your unique referral link and share it with friends and community.' },
              { n: 2, color: 'bg-accent-purple/20 text-accent-purple', title: 'They Stake',     body: 'When someone registers through your link and stakes tokens, you earn commissions.' },
              { n: 3, color: 'bg-accent-cyan/20 text-accent-cyan', title: 'Earn 10 Levels Deep', body: 'Earn from referrals up to 10 levels deep. The deeper the network, the higher the rewards!' },
            ].map(({ n, color, title, body }) => (
              <div key={n} className="flex items-start gap-4 p-3 rounded-xl bg-surface-800/30">
                <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center font-display font-bold text-sm shrink-0`}>{n}</div>
                <div>
                  <p className="font-display font-medium text-sm">{title}</p>
                  <p className="text-text-muted text-xs mt-0.5">{body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Current tier summary */}
          {currentTier && (
            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted">Active Team Bonus</p>
                <p className="font-display font-bold text-brand-400">+{currentTier.bonusPercentage}% ({currentTier.label})</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('team')}
                className="text-xs text-text-muted hover:text-text-secondary font-display transition-colors"
              >
                View tiers →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Levels ── */}
      {activeView === 'levels' && (
        <div className="glass-card">
          <h3 className="font-display font-semibold mb-4">Referral Commission Levels</h3>
          <div className="space-y-2">
            {REFERRAL_LEVELS.map((level) => (
              <div key={level.level} className="flex items-center justify-between p-3 rounded-xl bg-surface-800/30 hover:bg-surface-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    level.level <= 3  ? 'bg-brand-500/20 text-brand-400' :
                    level.level <= 6  ? 'bg-accent-purple/20 text-accent-purple' :
                    level.level <= 8  ? 'bg-accent-cyan/20 text-accent-cyan' :
                    'bg-accent-amber/20 text-accent-amber'
                  }`}>L{level.level}</div>
                  <span className="font-display text-sm">Level {level.level}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-28 h-2 rounded-full bg-surface-900 overflow-hidden">
                    <ProgressBar pct={(level.percentage / 8) * 100} className="bg-linear-to-r from-brand-500 to-accent-cyan" />
                  </div>
                  <span className="font-mono text-sm text-brand-400 w-14 text-right">{level.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-sm">
            <span className="text-text-muted">Total Commission (all levels)</span>
            <span className="font-mono text-brand-400 font-bold">30%</span>
          </div>
        </div>
      )}

      {/* ── Team Bonus ── */}
      {activeView === 'team' && (
        <div className="space-y-4">
          {/* Current tier banner */}
          <div className={`glass-card border ${
            currentTier
              ? 'bg-linear-to-br from-accent-purple/10 to-brand-500/10 border-accent-purple/20'
              : 'bg-surface-800/30 border-white/5'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-text-muted text-xs font-display uppercase tracking-wider mb-1">Your Current Tier</p>
                {currentTier ? (
                  <p className="font-display font-bold text-xl gradient-text">{currentTier.label} — +{currentTier.bonusPercentage}% Bonus</p>
                ) : (
                  <p className="font-display font-bold text-xl text-text-secondary">No Tier Yet</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-text-muted text-xs mb-1">Team Size · Team Staked</p>
                <p className="font-mono text-sm">
                  <span className="text-brand-400">{teamStats.teamSize}</span>
                  <span className="text-text-muted"> members · </span>
                  <span className="text-accent-cyan">{formatNumber(teamStats.teamTotalStaked)}</span>
                  <span className="text-text-muted"> FBiT</span>
                </p>
              </div>
            </div>

            {nextTier && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-text-muted text-xs mb-2">
                  Progress to <span className="text-brand-400 font-medium">{nextTier.label} (+{nextTier.bonusPercentage}%)</span>
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { label: 'Team Staked', cur: teamStats.teamTotalStaked, max: nextTier.minTeamStaked, fmt: true },
                  ].map(({ label, cur, max, fmt }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-muted">{label}</span>
                        <span className="font-mono text-text-secondary">{fmt ? formatNumber(cur) : cur} / {fmt ? formatNumber(max) : max}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-900 overflow-hidden">
                        <ProgressBar pct={(cur / max) * 100} className="bg-linear-to-r from-accent-cyan to-brand-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 10-Tier Table */}
          <div className="glass-card">
            <h3 className="font-display font-semibold mb-4">10-Tier Team Target Bonus</h3>
            <p className="text-text-muted text-xs mb-4">
              Grow your team's total staked FBiT to unlock a permanent bonus applied on top of
              every staking reward claim — automatically, no extra transaction needed.
            </p>
            <div className="space-y-3">
              {TEAM_TARGET_TIERS.map((tier) => {
                const isActive   = currentTier?.tier === tier.tier;
                const isUnlocked = currentTier ? currentTier.tier >= tier.tier : false;
                const colMap: Record<string, string> = {
                  amber:  'bg-accent-amber/20 text-accent-amber border-accent-amber/20',
                  slate:  'bg-surface-700/60 text-text-secondary border-white/10',
                  yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20',
                  cyan:   'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/20',
                  purple: 'bg-accent-purple/20 text-accent-purple border-accent-purple/20',
                  rose:   'bg-accent-rose/20 text-accent-rose border-accent-rose/20',
                  green:  'bg-emerald-400/20 text-emerald-400 border-emerald-400/20',
                  blue:   'bg-blue-400/20 text-blue-400 border-blue-400/20',
                  gray:   'bg-gray-400/20 text-gray-400 border-gray-400/20',
                  brand:  'bg-brand-500/20 text-brand-400 border-brand-500/20',
                };
                return (
                  <div
                    key={tier.tier}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                      isActive   ? 'bg-brand-500/10 border-brand-500/30' :
                      isUnlocked ? 'bg-surface-800/50 border-white/10' :
                      'bg-surface-800/20 border-white/5 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${colMap[tier.color]}`}>
                        T{tier.tier}
                      </div>
                      <div>
                        <p className="font-display font-medium text-sm flex items-center gap-2">
                          {tier.label}
                          {isActive   && <span className="text-xs text-brand-400 font-normal">(Active)</span>}
                          {isUnlocked && !isActive && <span className="text-xs text-text-muted">✓</span>}
                        </p>
                        <p className="text-text-muted text-xs mt-0.5">
                          {formatNumber(tier.minTeamStaked)} FBiT staked
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-display font-bold text-lg ${isUnlocked ? 'text-brand-400' : 'text-text-muted'}`}>
                        +{tier.bonusPercentage}%
                      </p>
                      <p className="text-text-muted text-xs">bonus</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-sm">
              <span className="text-text-muted">Max bonus (Titan)</span>
              <span className="font-mono text-brand-400 font-bold">+10%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── History ── */}
      {activeView === 'history' && (
        <div className="glass-card">
          <h3 className="font-display font-semibold mb-4">
            Referral History
            <span className="ml-2 text-xs text-text-muted font-normal">({totalReferrals} total)</span>
          </h3>
          {(referralInfo?.referrals ?? []).length === 0 ? (
            <p className="text-center py-8 text-text-muted text-sm">No referrals yet. Share your link to get started!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted text-xs font-display uppercase tracking-wider">
                    <th className="text-left pb-3 pl-3">User</th>
                    <th className="text-center pb-3">Level</th>
                    <th className="text-right pb-3">Staked</th>
                    <th className="text-right pb-3">Reward</th>
                    <th className="text-right pb-3 pr-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {referralInfo?.referrals.map((entry, i) => (
                    <tr key={i} className="hover:bg-white/2 transition-colors">
                      <td className="py-3 pl-3 font-mono text-xs">{entry.address}</td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                          entry.level === 1 ? 'bg-brand-500/10 text-brand-400' :
                          entry.level === 2 ? 'bg-accent-purple/10 text-accent-purple' :
                          entry.level <= 4  ? 'bg-accent-cyan/10 text-accent-cyan' :
                          'bg-accent-amber/10 text-accent-amber'
                        }`}>
                          L{entry.level}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-xs">{formatNumber(entry.stakedAmount)} FBiT</td>
                      <td className="py-3 text-right font-mono text-xs text-brand-400">+{formatNumber(entry.rewardEarned)}</td>
                      <td className="py-3 text-right pr-3 text-xs text-text-muted">
                        {new Date(entry.registeredAt * 1000).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
