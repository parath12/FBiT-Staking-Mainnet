'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useWallet } from '@/context/WalletContext';
import { isAdminAddress } from '@/context/WalletContext';
import { useAppStore } from '@/lib/store';
import { formatNumber } from '@/lib/utils';
import { useContract } from '@/hooks/useContract';
import { TEAM_TARGET_TIERS } from '@/types';
import { checkRateLimit, isValidWalletAddress, isValidAmount, isValidBonusBps, sanitizeText } from '@/lib/security';
import ContractSetupNotice from '@/components/ui/ContractSetupNotice';

export default function AdminPanel() {
  const { address } = useWallet();
  const { selectedNetwork, platformStats, updatePlatformStats, addTransaction, getWalletData } = useAppStore();
  const contract = useContract();

  const [fundAmount, setFundAmount]         = useState('');
  const [reserveAmount, setReserveAmount]   = useState('');
  const [yearBurnAmount, setYearBurnAmount] = useState('');
  const [rewardRate, setRewardRate]         = useState('');
  const [referralRate, setReferralRate] = useState('');
  const [userAddress, setUserAddress]   = useState('');
  const [processing, setProcessing]       = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'pool' | 'rates' | 'users' | 'tiers' | 'platform'>('pool');
  const [renounceConfirm, setRenounceConfirm] = useState(false);

  // Annual emission management state
  const [annualEmissionValue, setAnnualEmissionValue] = useState('');
  // Burn BPS management state
  const [burnBpsValue, setBurnBpsValue] = useState('');

  // Team Target Tier management state
  const [tierIndex,        setTierIndex]        = useState('0');
  const [tierMinStaked,    setTierMinStaked]    = useState('');
  const [tierBonusBps,     setTierBonusBps]     = useState('');

  const walletData = getWalletData();

  const run = async (
    key: string,
    onChainFn: (() => Promise<{ txHash: string }>) | null,
    successMsg: string
  ) => {
    // SECURITY: Re-verify admin identity and rate-limit on every sensitive action.
    if (!address || !isAdminAddress(address)) {
      toast.error('Security check failed: connected wallet is not an admin.');
      return;
    }
    if (!checkRateLimit(`admin-${key}`, { maxCalls: 3, windowMs: 60_000 })) {
      toast.error('Too many attempts for this action. Wait 60 seconds.');
      return;
    }
    setProcessing(key);
    const toastId = toast.loading('Processing transaction…');
    try {
      if (!contract.isLive || !onChainFn) throw new Error('Contract not configured. Set up your deployment addresses to execute on-chain admin transactions.');
      const result = await onChainFn();
      const txHash = result.txHash;
      contract.syncPlatformStats().catch(() => {});
      addTransaction({
        id: Date.now().toString(),
        type: 'admin',
        label: successMsg,
        amount: 0,
        txHash,
        timestamp: Date.now(),
        status: 'success',
        network: selectedNetwork,
      });
      toast.success(successMsg, { id: toastId });
    } catch (err: any) {
      toast.error(err?.message ?? 'Transaction failed.', { id: toastId });
    } finally {
      setProcessing(null);
    }
  };

  const handleDepositReserve = () => {
    const n = parseFloat(reserveAmount);
    if (!n || n <= 0) return;
    run('reserve', () => contract.depositReserve(n), `Deposited ${formatNumber(n)} FBiT into auto-emission reserve`);
  };

  const handleReleaseEmission = () => {
    run('release', () => contract.releaseEmission(), 'Released available emission into reward pool');
  };

  const handleBurnUnusedPool = () => {
    const n = parseFloat(yearBurnAmount);
    if (!n || n <= 0) return;
    run('yearBurn', () => contract.burnUnusedPool(n),
      `Year-end burn: ${formatNumber(n)} FBiT burned — emission schedule shortened`);
  };

  const handleFund = () => {
    const n = parseFloat(fundAmount);
    if (!n || n <= 0) return;
    run('fund', () => contract.fundRewardPool(n), `Funded reward pool with ${formatNumber(n)} FBiT`);
  };

  const handleSetRewardRate = () => {
    const n = parseInt(rewardRate, 10);
    if (!n || n <= 0) return;
    run('rewardRate', () => contract.setRewardRate(n), `Reward rate updated to ${n / 100}%`);
  };

  const handleSetReferralRate = () => {
    const n = parseInt(referralRate, 10);
    if (!n || n <= 0) return;
    run('referralRate', () => contract.setReferralRewardRate(n), `Referral rate updated to ${n / 100}%`);
  };

  const handleBlock = () => {
    const addr = sanitizeText(userAddress);
    if (!isValidWalletAddress(addr)) { toast.error('Invalid wallet address format.'); return; }
    run('block', () => contract.blockUser(addr), `User ${addr.slice(0, 8)}… blocked`);
  };

  const handleUnblock = () => {
    const addr = sanitizeText(userAddress);
    if (!isValidWalletAddress(addr)) { toast.error('Invalid wallet address format.'); return; }
    run('unblock', () => contract.unblockUser(addr), `User ${addr.slice(0, 8)}… unblocked`);
  };

  const handleTogglePause = () =>
    run('pause', () => contract.togglePause(platformStats.isPaused), platformStats.isPaused ? 'Platform resumed' : 'Platform paused');


  const handleRenounceOwnership = () => {
    setRenounceConfirm(false);
    run(
      'renounce',
      async () => {
        const result = await contract.renounceOwnership();
        // Immediately flip the store so the UI switches to fee-recipient view
        updatePlatformStats({ isRenounced: true, feeRecipient: address ?? '' });
        return result;
      },
      'Ownership renounced — 25% passive fee active',
    );
  };

  const handleSetTeamTier = () => {
    const idx = parseInt(tierIndex, 10);
    const min = parseFloat(tierMinStaked);
    const bps = parseInt(tierBonusBps, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx > 9) { toast.error('Tier index must be 0–9.'); return; }
    if (!isValidAmount(min)) { toast.error('Min staked must be a positive number.'); return; }
    if (!isValidBonusBps(bps)) { toast.error('Bonus BPS must be 1–1000.'); return; }
    run(
      'teamTier',
      () => contract.setTeamTargetTier(idx, min, bps),
      `Team tier ${idx + 1} updated: ${min.toLocaleString()} FBiT → ${(bps / 100).toFixed(2)}% bonus`
    );
  };

  const handleSyncAllTiers = async () => {
    if (!contract.isLive) { toast.error('Contract not configured.'); return; }
    if (platformStats.isRenounced) return;
    setProcessing('syncAllTiers');
    let successCount = 0;
    for (let i = 0; i < TEAM_TARGET_TIERS.length; i++) {
      const t = TEAM_TARGET_TIERS[i];
      try {
        await contract.setTeamTargetTier(i, t.minTeamStaked, t.bonusBps);
        successCount++;
        toast.success(`Tier ${i + 1} (${t.label}) updated ✓`, { duration: 2000 });
      } catch (err: any) {
        toast.error(`Tier ${i + 1} failed: ${err?.message ?? 'error'}`);
        break;
      }
    }
    setProcessing(null);
    if (successCount === TEAM_TARGET_TIERS.length) {
      toast.success(`All ${TEAM_TARGET_TIERS.length} tiers synced to contract!`);
    }
  };

  const handleSetBurnBps = () => {
    const bps = parseInt(burnBpsValue, 10);
    if (isNaN(bps) || bps < 0 || bps > 5000) return;
    run('burnBps', () => contract.setBurnBps(bps), `Burn rate updated to ${(bps / 100).toFixed(2)}%`);
  };

  const handleSetAnnualEmission = () => {
    const emission = parseFloat(annualEmissionValue);
    if (isNaN(emission) || emission <= 0) return;
    run('annualEmission', () => contract.setAnnualEmission(emission), `Annual emission updated to ${emission.toLocaleString()} FBiT/year`);
  };

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-accent-rose/20 to-accent-amber/20 flex items-center justify-center animate-float">
          <span className="text-3xl">{platformStats.isRenounced ? '💰' : '⚙'}</span>
        </div>
        <h2 className="font-display text-2xl font-bold">
          {platformStats.isRenounced ? 'Fee Recipient Panel' : 'Admin Panel'}
        </h2>
        <p className="text-text-secondary max-w-sm">
          {platformStats.isRenounced
            ? 'Connect the fee recipient wallet to view your fee earnings.'
            : 'Connect the owner wallet to manage the platform.'}
        </p>
        {platformStats.isRenounced && (
          <div className="glass-card max-w-sm w-full text-left border border-accent-amber/20 bg-accent-amber/5 space-y-1 mt-2">
            <p className="text-accent-amber text-xs font-display font-semibold">Passive Fee Mode Active</p>
            <p className="text-text-muted text-xs">
              25% of every gross reward (claim & compound) is sent directly to your wallet from pool automatically — no action needed.
            </p>
          </div>
        )}
      </div>
    );
  }

  const busy = (key: string) => processing === key;

  // Determine renounced state and whether the connected wallet is the fee recipient
  const isRenounced = Boolean(platformStats.isRenounced);
  const isFeeRecipient =
    isRenounced &&
    !!platformStats.feeRecipient &&
    address.toLowerCase() === platformStats.feeRecipient.toLowerCase();

  // ── Fee Recipient View (post-renounce, former admin wallet) ────────────────
  if (isFeeRecipient) {
    const walletData = getWalletData();
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="glass-card bg-linear-to-r from-accent-amber/5 to-accent-rose/5 border-accent-amber/10">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="font-display font-bold text-xl">Admin Panel</h2>
              <p className="text-text-muted text-sm">
                Fee Recipient · {selectedNetwork === 'solana' ? 'Solana' : 'Polygon'}
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-lg text-xs font-display font-medium bg-accent-amber/10 text-accent-amber border border-accent-amber/20">
              🔓 Ownership Renounced
            </span>
          </div>
        </div>

        {/* Notice */}
        <div className="glass-card border border-accent-amber/20 bg-accent-amber/5 space-y-1">
          <p className="font-display font-semibold text-accent-amber text-sm">Passive Fee Mode Active</p>
          <p className="text-text-secondary text-xs leading-relaxed">
            You have permanently renounced admin ownership. All platform controls are disabled.
            A <span className="text-accent-amber font-semibold">25% passive fee</span> is automatically
            sent to your wallet from the reward pool each time any user Claims or Compounds — no
            action required on your part.
          </p>
        </div>

        {/* Fee Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card text-center p-5">
            <p className="text-text-muted text-xs font-display uppercase tracking-wider mb-2">Total Fees Earned</p>
            <p className="font-display font-bold text-2xl text-accent-amber">
              {formatNumber(platformStats.totalFeesCollected ?? 0)}
            </p>
            <p className="text-text-muted text-xs mt-1">FBiT collected</p>
          </div>
          <div className="glass-card text-center p-5">
            <p className="text-text-muted text-xs font-display uppercase tracking-wider mb-2">Fee Rate</p>
            <p className="font-display font-bold text-2xl text-brand-400">25%</p>
            <p className="text-text-muted text-xs mt-1">of gross reward on every claim / compound</p>
          </div>
          <div className="glass-card text-center p-5">
            <p className="text-text-muted text-xs font-display uppercase tracking-wider mb-2">Your Balance</p>
            <p className="font-display font-bold text-2xl text-accent-cyan">
              {formatNumber(walletData?.tokenBalance ?? 0)}
            </p>
            <p className="text-text-muted text-xs mt-1">FBiT in wallet</p>
          </div>
        </div>

        {/* How it works */}
        <div className="glass-card space-y-3">
          <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-text-secondary">How Fees Work</h3>
          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-800/40 border border-white/5">
              <span className="text-accent-amber mt-0.5">●</span>
              <span>Fees are transferred automatically on every user Claim or Compound — directly into your wallet. No manual action needed.</span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-800/40 border border-white/5">
              <span className="text-accent-amber mt-0.5">●</span>
              <span>The fee is drawn from the reward pool separately — users receive 100% of their earned reward with no deductions.</span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-800/40 border border-white/5">
              <span className="text-accent-amber mt-0.5">●</span>
              <span>This arrangement is permanent and irreversible. Even without connecting your wallet, fees continue to arrive on-chain.</span>
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        {(walletData?.transactions.filter(t => t.type === 'admin') ?? []).length > 0 && (
          <div className="glass-card space-y-3">
            <p className="text-xs text-text-muted font-display uppercase tracking-wider">Recent History</p>
            <div className="space-y-1.5">
              {walletData?.transactions.filter(t => t.type === 'admin').slice(0, 5).map(tx => (
                <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-800/40 border border-white/5 text-xs">
                  <span className="text-text-secondary">{tx.label}</span>
                  <span className="text-text-muted font-mono">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="glass-card bg-linear-to-r from-accent-amber/5 to-accent-rose/5 border-accent-amber/10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display font-bold text-xl">Admin Panel</h2>
            <p className="text-text-muted text-sm">
              Manage the FBiT Staking platform on {selectedNetwork === 'solana' ? 'Solana' : 'Polygon'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg text-xs font-display font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
              ⬡ On-Chain
            </div>
            <div className={`px-4 py-2 rounded-xl text-sm font-display font-medium ${
              platformStats.isPaused
                ? 'bg-accent-rose/10 text-accent-rose border border-accent-rose/20'
                : 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
            }`}>
              {platformStats.isPaused ? '⏸ Paused' : '● Active'}
            </div>
          </div>
        </div>
      </div>

      {/* Contract setup notice */}
      <ContractSetupNotice />

      {/* Renounced banner — shown when ownership has been given up by a different address */}
      {isRenounced && (
        <div className="glass-card border border-accent-rose/30 bg-accent-rose/5 flex items-start gap-3">
          <span className="text-accent-rose text-lg mt-0.5">🔒</span>
          <div>
            <p className="font-display font-semibold text-accent-rose text-sm">Ownership Has Been Renounced</p>
            <p className="text-text-secondary text-xs mt-0.5 leading-relaxed">
              Admin control was permanently surrendered. All management functions are disabled.
              Fee recipient: <span className="font-mono text-accent-amber">{platformStats.feeRecipient?.slice(0, 8)}…{platformStats.feeRecipient?.slice(-6)}</span> ·{' '}
              Total fees paid: <span className="text-accent-amber font-semibold">{formatNumber(platformStats.totalFeesCollected ?? 0)} FBiT</span>
            </p>
          </div>
        </div>
      )}

      {/* Quick Stats — live from store */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'TVL',          value: formatNumber(platformStats.totalStaked),                                    color: 'text-brand-400' },
          { label: 'Users',        value: formatNumber(platformStats.totalUsers, 0),                                  color: 'text-accent-purple' },
          { label: 'Reserve',      value: formatNumber(platformStats.totalReserve ?? 0),                              color: 'text-brand-400' },
          { label: 'Reward Pool',  value: formatNumber(platformStats.rewardPoolBalance),                              color: 'text-accent-cyan' },
          { label: 'Current APY',  value: `${Math.round((platformStats.effectiveAPY ?? 6000) / 100)}%`,             color: 'text-accent-amber' },
          { label: 'Total Burned 🔥', value: formatNumber(platformStats.totalBurned ?? 0),                           color: 'text-accent-rose' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card text-center p-4">
            <p className="text-text-muted text-xs mb-1">{label}</p>
            <p className={`font-display font-bold text-lg ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-800/50 border border-white/5 overflow-x-auto">
        {(['pool', 'rates', 'tiers', 'users', 'platform'] as const).map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setActiveSection(s)}
            className={`flex-1 py-2.5 rounded-lg font-display text-sm font-medium transition-all whitespace-nowrap px-3 ${
              activeSection === s
                ? 'bg-accent-amber/10 text-accent-amber shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {s === 'pool' ? 'Reward Pool' : s === 'rates' ? 'Rates' : s === 'tiers' ? 'Team Tiers' : s === 'users' ? 'User Mgmt' : 'Platform'}
          </button>
        ))}
      </div>

      {/* ── Reward Pool ── */}
      {activeSection === 'pool' && (
        <div className="space-y-4">

          {/* ── Auto-Emission Reserve (primary) ── */}
          <div className="glass-card space-y-4 border border-brand-500/20">
            <div>
              <h3 className="font-display font-semibold text-lg mb-1">Auto-Emission Reserve</h3>
              <p className="text-text-muted text-xs leading-relaxed">
                Deposit your <span className="text-brand-400 font-semibold">full token supply once</span>.
                The contract releases <span className="text-brand-400">{formatNumber(platformStats.annualEmission || 1000000)} FBiT/year</span> automatically
                into the reward pool — <span className="text-accent-cyan">no manual management ever again</span>.
              </p>
            </div>

            {/* Reserve Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Reserve',           value: `${formatNumber(platformStats.totalReserve ?? 0)} FBiT`,           color: 'text-brand-400' },
                { label: 'Released Total',    value: `${formatNumber(platformStats.totalEmissionReleased ?? 0)} FBiT`,  color: 'text-accent-cyan' },
                { label: 'Releasable Now',    value: `${formatNumber(platformStats.releasableEmission ?? 0)} FBiT`,     color: 'text-accent-amber' },
                { label: 'Reward Pool',       value: `${formatNumber(platformStats.rewardPoolBalance)} FBiT`,           color: 'text-accent-purple' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 rounded-xl bg-surface-800/40 border border-white/5 text-center">
                  <p className="text-text-muted text-[10px] font-display uppercase tracking-wider mb-1">{label}</p>
                  <p className={`font-mono font-semibold text-sm ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {platformStats.emissionStartTime && platformStats.emissionStartTime > 0 ? (
              <p className="text-xs text-text-muted">
                Emission clock started: <span className="text-text-secondary font-mono">
                  {new Date(platformStats.emissionStartTime * 1000).toLocaleDateString()}
                </span>
              </p>
            ) : (
              <p className="text-xs text-accent-amber">⚠ Reserve not yet funded — deposit tokens to start the emission clock.</p>
            )}
            {!isRenounced && (
              <p className="text-xs text-accent-rose">
                ⚠ <span className="font-semibold">Deposit before renouncing ownership.</span> Once renounced, the reserve cannot be topped up — only auto-release continues.
              </p>
            )}

            {/* Deposit Reserve */}
            <div>
              <label className="text-sm text-text-secondary font-display mb-1 block">
                Deposit Amount (FBiT) — e.g. 800,000,000 for full supply
              </label>
              <input
                type="number"
                value={reserveAmount}
                onChange={(e) => setReserveAmount(e.target.value)}
                placeholder="e.g. 800000000"
                className="input-field font-mono"
              />
            </div>
            <AdminButton
              label={isRenounced ? 'Deposit Disabled (Ownership Renounced)' : 'Deposit Full Reserve (One-Time)'}
              loadingLabel="Depositing…"
              onClick={handleDepositReserve}
              disabled={isRenounced || !reserveAmount || parseFloat(reserveAmount) <= 0}
              loading={busy('reserve')}
              variant="primary"
            />

            {/* Manual release trigger — always visible, disabled when nothing to release */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              {(platformStats.releasableEmission ?? 0) > 0 ? (
                <p className="text-xs text-accent-amber">
                  <span className="font-semibold">{formatNumber(platformStats.releasableEmission ?? 0)} FBiT</span> is available now.
                  Releases automatically on the next claim/compound — or trigger manually.
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  No emission available to release yet. Tokens accumulate at {formatNumber(platformStats.annualEmission || 1000000)} FBiT/year.
                </p>
              )}
              <AdminButton
                label={(platformStats.releasableEmission ?? 0) > 0
                  ? `Release ${formatNumber(platformStats.releasableEmission ?? 0)} FBiT Now`
                  : 'Release Emission (Nothing Available)'}
                loadingLabel="Releasing…"
                onClick={handleReleaseEmission}
                disabled={(platformStats.releasableEmission ?? 0) <= 0}
                loading={busy('release')}
                variant="amber"
              />
            </div>
          </div>

          {/* ── Year-End Burn ── */}
          <div className="glass-card space-y-4 border border-accent-rose/20">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-display font-semibold text-lg">Year-End Burn</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-display font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  ● AUTOMATIC
                </span>
              </div>
              <p className="text-text-muted text-xs leading-relaxed">
                <span className="text-brand-400 font-semibold">Fully automated — no admin action required.</span>{' '}
                The first user claim or compound of each new year automatically burns all leftover pool tokens
                from the previous year, then releases fresh emission.
                Each burn <span className="text-accent-rose">permanently reduces the emission duration</span>.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Remaining Years',     value: String(platformStats.remainingYears ?? 800),             color: 'text-brand-400' },
                { label: 'Next Burn Allowed',   value: platformStats.lastYearBurnTime
                    ? new Date((platformStats.lastYearBurnTime + 365 * 86400) * 1000).toLocaleDateString()
                    : 'After first deposit',                                                                      color: 'text-accent-amber' },
                { label: 'Total Yearly Burned', value: `${formatNumber(platformStats.totalYearlyBurned ?? 0)}`, color: 'text-accent-rose' },
                { label: 'Burnable Surplus',    value: `${formatNumber(Math.max(0, platformStats.rewardPoolBalance - (platformStats.maxPendingRewards ?? 0)))}`, color: 'text-accent-purple' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 rounded-xl bg-surface-800/40 border border-white/5 text-center">
                  <p className="text-text-muted text-[10px] font-display uppercase tracking-wider mb-1">{label}</p>
                  <p className={`font-mono font-semibold text-sm ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* User fund protection breakdown */}
            <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/15 text-xs space-y-1">
              <p className="text-green-400 font-semibold font-display">User Fund Protection</p>
              <div className="flex justify-between text-text-muted">
                <span>Pool balance</span>
                <span className="font-mono text-text-secondary">{formatNumber(platformStats.rewardPoolBalance)} FBiT</span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Protected (owed to users)</span>
                <span className="font-mono text-green-400">− {formatNumber(platformStats.maxPendingRewards ?? 0)} FBiT</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1 font-semibold">
                <span className="text-accent-rose">Burnable surplus</span>
                <span className="font-mono text-accent-rose">{formatNumber(Math.max(0, platformStats.rewardPoolBalance - (platformStats.maxPendingRewards ?? 0)))} FBiT</span>
              </div>
              <p className="text-text-muted pt-0.5">The year-end auto-burn will never touch the protected amount — user rewards are always safe.</p>
            </div>

            <div className="p-3 rounded-xl bg-brand-500/5 border border-brand-500/10 text-xs text-text-muted space-y-1">
              <p className="text-brand-400 font-semibold">How automation works:</p>
              <p>• Year 1 emission released → users claim rewards throughout the year</p>
              <p>• First claim/compound of Year 2 → contract auto-burns surplus pool only → releases Year 2 emission</p>
              <p>• Unclaimed user rewards are protected and carried forward — never burned</p>
              <p>• Duration shortens automatically — no admin needed, ever</p>
            </div>

            {/* Emergency manual burn — collapse by default */}
            <details>
              <summary className="text-xs text-text-muted cursor-pointer select-none font-display">
                Emergency manual burn (advanced)
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-text-muted text-xs">
                  Use only to manually trigger a surplus burn before any user interacts in the new year.
                  The contract enforces user-fund protection — you cannot burn below the protected floor.
                </p>
                <div>
                  <label className="text-sm text-text-secondary font-display mb-1 block">
                    Amount — burnable surplus: <span className="text-accent-rose font-mono">{formatNumber(Math.max(0, platformStats.rewardPoolBalance - (platformStats.maxPendingRewards ?? 0)))} FBiT</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={yearBurnAmount}
                      onChange={(e) => setYearBurnAmount(e.target.value)}
                      placeholder="e.g. 50000"
                      className="input-field font-mono flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setYearBurnAmount(Math.max(0, platformStats.rewardPoolBalance - (platformStats.maxPendingRewards ?? 0)).toFixed(0))}
                      className="px-3 py-2 rounded-lg text-xs font-display bg-accent-rose/10 text-accent-rose border border-accent-rose/20 hover:bg-accent-rose/20 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                </div>
                <AdminButton
                  label={`Emergency Burn ${yearBurnAmount ? formatNumber(parseFloat(yearBurnAmount) || 0) : '0'} FBiT`}
                  loadingLabel="Burning…"
                  onClick={handleBurnUnusedPool}
                  disabled={
                    isRenounced ||
                    !yearBurnAmount ||
                    parseFloat(yearBurnAmount) <= 0 ||
                    parseFloat(yearBurnAmount) > Math.max(0, platformStats.rewardPoolBalance - (platformStats.maxPendingRewards ?? 0))
                  }
                  loading={busy('yearBurn')}
                  variant="rose"
                />
              </div>
            </details>
          </div>

          {/* ── Manual Pool Top-Up (fallback) ── */}
          <details className="glass-card space-y-4">
            <summary className="font-display font-semibold text-sm text-text-secondary cursor-pointer select-none">
              Manual Pool Top-Up (fallback)
            </summary>
            <p className="text-text-muted text-xs mt-2">
              Add tokens directly to the reward pool. Use only if the auto-emission reserve was not funded.
            </p>
            <div>
              <label className="text-sm text-text-secondary font-display mb-1 block">Amount (FBiT)</label>
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="e.g. 100000"
                className="input-field font-mono"
              />
            </div>
            <AdminButton
              label="Fund Reward Pool"
              loadingLabel="Funding…"
              onClick={handleFund}
              disabled={isRenounced || !fundAmount || parseFloat(fundAmount) <= 0}
              loading={busy('fund')}
              variant="cyan"
            />
          </details>
        </div>
      )}

      {/* ── Rates ── */}
      {activeSection === 'rates' && (
        <div className="space-y-4">
          <div className="glass-card space-y-4">
            <h3 className="font-display font-semibold text-lg">Reward Rate</h3>
            <p className="text-text-muted text-xs -mt-2">
              Current: <span className="text-accent-purple font-mono">{platformStats.rewardRate / 100}%</span> ({platformStats.rewardRate} bps)
            </p>
            <div>
              <label className="text-sm text-text-secondary font-display mb-1 block">
                New rate (basis points — 1000 = 10%)
              </label>
              <input
                type="number"
                value={rewardRate}
                onChange={(e) => setRewardRate(e.target.value)}
                placeholder={`Current: ${platformStats.rewardRate}`}
                className="input-field font-mono"
              />
            </div>
            <AdminButton
              label="Update Reward Rate"
              loadingLabel="Updating…"
              onClick={handleSetRewardRate}
              disabled={isRenounced || !rewardRate || parseInt(rewardRate) <= 0}
              loading={busy('rewardRate')}
              variant="purple"
            />
          </div>

          <div className="glass-card space-y-4">
            <h3 className="font-display font-semibold text-lg">Referral Reward Rate</h3>
            <p className="text-text-muted text-xs -mt-2">
              Current: <span className="text-accent-cyan font-mono">{platformStats.referralRewardRate / 100}%</span> ({platformStats.referralRewardRate} bps)
            </p>
            <div>
              <label className="text-sm text-text-secondary font-display mb-1 block">
                New rate (basis points)
              </label>
              <input
                type="number"
                value={referralRate}
                onChange={(e) => setReferralRate(e.target.value)}
                placeholder={`Current: ${platformStats.referralRewardRate}`}
                className="input-field font-mono"
              />
            </div>
            <AdminButton
              label="Update Referral Rate"
              loadingLabel="Updating…"
              onClick={handleSetReferralRate}
              disabled={isRenounced || !referralRate || parseInt(referralRate) <= 0}
              loading={busy('referralRate')}
              variant="cyan"
            />
          </div>

          {/* Burn BPS update */}
          <div className="glass-card space-y-4">
            <h3 className="font-display font-semibold text-lg">Burn Percentage</h3>
            <p className="text-text-muted text-xs -mt-2">
              Percentage of user's reward burned on every claim / compound.
              Deducted from user's share — not an extra pool cost. Range: <span className="text-brand-400">0% – 50%</span>.
            </p>
            <div className="p-3 rounded-xl bg-accent-rose/5 border border-accent-rose/10 text-xs text-text-muted space-y-1">
              <p>Current burn rate: <span className="text-accent-rose font-mono font-semibold">{((platformStats.burnBps ?? 1000) / 100).toFixed(2)}%</span> ({platformStats.burnBps ?? 1000} bps)</p>
              <p>Example: 100 FBiT reward → <span className="text-accent-rose font-semibold">{((platformStats.burnBps ?? 1000) / 100).toFixed(2)} FBiT burned</span>, {(100 - (platformStats.burnBps ?? 1000) / 100).toFixed(2)} FBiT to user</p>
            </div>
            <div>
              <label className="text-sm text-text-secondary font-display mb-1 block">New Burn Rate (basis points — 100 bps = 1%)</label>
              <input
                type="number"
                min="0"
                max="5000"
                value={burnBpsValue}
                onChange={(e) => setBurnBpsValue(e.target.value)}
                placeholder="e.g. 2500 = 25%, 1000 = 10%, 0 = no burn"
                className="input-field font-mono"
              />
            </div>
            <AdminButton
              label="Update Burn Rate"
              loadingLabel="Updating…"
              onClick={handleSetBurnBps}
              disabled={isRenounced || burnBpsValue === '' || parseInt(burnBpsValue) < 0 || parseInt(burnBpsValue) > 5000}
              loading={busy('burnBps')}
              variant="rose"
            />
          </div>

          {/* Annual Emission update */}
          <div className="glass-card space-y-4">
            <h3 className="font-display font-semibold text-lg">Annual Emission (PoS APY)</h3>
            <p className="text-text-muted text-xs -mt-2">
              Total FBiT distributed to stakers per year. APY auto-adjusts:
              effectiveAPY = emission ÷ totalStaked, clamped between <span className="text-brand-400">60%</span> and <span className="text-brand-400">500%</span>.
              More stakers → lower APY. Fewer stakers → higher APY.
            </p>
            <div className="p-3 rounded-xl bg-brand-500/5 border border-brand-500/20 text-xs text-text-muted space-y-1">
              <p>Current emission: <span className="text-accent-cyan font-mono">{(platformStats.annualEmission ?? 0).toLocaleString()} FBiT/year</span></p>
              <p>APY range: <span className="text-brand-400 font-semibold">60% – 500%</span></p>
            </div>
            <div>
              <label className="text-sm text-text-secondary font-display mb-1 block">New Annual Emission (FBiT tokens/year)</label>
              <input
                type="number"
                value={annualEmissionValue}
                onChange={(e) => setAnnualEmissionValue(e.target.value)}
                placeholder="e.g. 1000000 for 800M over 800 years"
                className="input-field font-mono"
              />
            </div>
            <AdminButton
              label="Update Annual Emission"
              loadingLabel="Updating…"
              onClick={handleSetAnnualEmission}
              disabled={isRenounced || !annualEmissionValue || parseFloat(annualEmissionValue) <= 0}
              loading={busy('annualEmission')}
              variant="purple"
            />
          </div>
        </div>
      )}

      {/* ── Team Target Tiers ── */}
      {activeSection === 'tiers' && (
        <div className="space-y-4">
          {/* Current tier table */}
          <div className="glass-card">
            <h3 className="font-display font-semibold text-lg mb-1">Team Target Bonus Tiers</h3>
            <p className="text-text-muted text-xs mb-4">
              10 tiers applied on top of staking rewards. Bonus is based on the user's team total staked FBiT.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-text-muted font-display uppercase tracking-wider border-b border-white/5">
                    <th className="text-left py-2 pr-4">Tier</th>
                    <th className="text-left py-2 pr-4">Label</th>
                    <th className="text-right py-2 pr-4">Min Team Staked</th>
                    <th className="text-right py-2">Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {TEAM_TARGET_TIERS.map((tier) => (
                    <tr key={tier.tier} className="border-b border-white/5 last:border-0">
                      <td className="py-2 pr-4 text-text-muted">{tier.tier}</td>
                      <td className="py-2 pr-4 font-display font-medium text-text-primary">{tier.label}</td>
                      <td className="py-2 pr-4 text-right text-text-secondary">
                        {tier.minTeamStaked.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-brand-400 font-semibold">
                        +{tier.bonusPercentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Update a single tier */}
          <div className="glass-card space-y-4">
            <h3 className="font-display font-semibold text-lg">Update a Tier</h3>
            <p className="text-text-muted text-xs -mt-2">
              Override any tier's minimum team staked threshold and bonus BPS on-chain.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="tier-index-select" className="text-sm text-text-secondary font-display mb-1 block">
                  Tier (0 = Tier 1)
                </label>
                <select
                  id="tier-index-select"
                  value={tierIndex}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const idx = parseInt(e.target.value);
                    setTierIndex(e.target.value);
                    const t = TEAM_TARGET_TIERS[idx];
                    if (t) {
                      setTierMinStaked(String(t.minTeamStaked));
                      setTierBonusBps(String(t.bonusBps));
                    }
                  }}
                  className="input-field font-mono"
                >
                  {TEAM_TARGET_TIERS.map((t, i) => (
                    <option key={i} value={String(i)}>
                      {i}: {t.label} (+{t.bonusPercentage}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-text-secondary font-display mb-1 block">
                  Min Team Staked (tokens)
                </label>
                <input
                  type="number"
                  value={tierMinStaked}
                  onChange={(e) => setTierMinStaked(e.target.value)}
                  placeholder="e.g. 50000"
                  className="input-field font-mono"
                />
              </div>

              <div>
                <label className="text-sm text-text-secondary font-display mb-1 block">
                  Bonus BPS (max 1000 = 10%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={tierBonusBps}
                  onChange={(e) => setTierBonusBps(e.target.value)}
                  placeholder="e.g. 200 = 2%"
                  className="input-field font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-muted p-3 rounded-xl bg-surface-800/40 border border-white/5">
              <span className="text-accent-amber">⚑</span>
              Preview: Tier {parseInt(tierIndex) + 1} —{' '}
              {tierMinStaked ? Number(tierMinStaked).toLocaleString() : '—'} FBiT →{' '}
              <span className="text-brand-400 font-semibold">
                +{tierBonusBps ? (parseInt(tierBonusBps) / 100).toFixed(2) : '—'}%
              </span>
            </div>

            <AdminButton
              label="Update Tier On-Chain"
              loadingLabel="Updating…"
              onClick={handleSetTeamTier}
              disabled={isRenounced || !tierMinStaked || !tierBonusBps || parseInt(tierBonusBps) <= 0 || parseInt(tierBonusBps) > 1000}
              loading={busy('teamTier')}
              variant="amber"
            />
          </div>

          {/* Sync all tiers at once */}
          <div className="glass-card space-y-3 border border-brand-500/20 bg-brand-500/5">
            <div>
              <h3 className="font-display font-semibold text-base">Sync All 10 Tiers to Contract</h3>
              <p className="text-text-muted text-xs mt-1">
                Applies current frontend tier values to the smart contract in one go — all 10 tiers sequentially.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-text-muted">
              {TEAM_TARGET_TIERS.map((t, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-800/40 border border-white/5">
                  <span className="text-text-secondary">T{i + 1} {t.label}</span>
                  <span className="text-brand-400">{t.minTeamStaked.toLocaleString()} FBiT · +{t.bonusPercentage}%</span>
                </div>
              ))}
            </div>
            <AdminButton
              label="Sync All Tiers to Contract"
              loadingLabel="Syncing tiers… (10 transactions)"
              onClick={handleSyncAllTiers}
              disabled={isRenounced || processing !== null}
              loading={processing === 'syncAllTiers'}
              variant="brand"
            />
          </div>
        </div>
      )}

      {/* ── User Management ── */}
      {activeSection === 'users' && (
        <div className="glass-card space-y-4">
          <h3 className="font-display font-semibold text-lg">User Management</h3>
          <div>
            <label className="text-sm text-text-secondary font-display mb-1 block">Wallet Address</label>
            <input
              type="text"
              value={userAddress}
              onChange={(e) => setUserAddress(e.target.value)}
              placeholder="Enter full wallet address…"
              className="input-field font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AdminButton
              label="Block User"
              loadingLabel="Blocking…"
              onClick={handleBlock}
              disabled={isRenounced || !userAddress.trim()}
              loading={busy('block')}
              variant="rose"
            />
            <AdminButton
              label="Unblock User"
              loadingLabel="Unblocking…"
              onClick={handleUnblock}
              disabled={isRenounced || !userAddress.trim()}
              loading={busy('unblock')}
              variant="primary"
            />
          </div>
        </div>
      )}

      {/* ── Platform Controls ── */}
      {activeSection === 'platform' && (
        <div className="glass-card space-y-4">
          <h3 className="font-display font-semibold text-lg">Platform Controls</h3>

          <div className="flex items-center justify-between p-4 rounded-xl bg-surface-800/50 border border-white/5">
            <div>
              <p className="font-display font-medium">Platform Status</p>
              <p className="text-text-muted text-sm mt-0.5">
                {platformStats.isPaused
                  ? 'Platform is paused. All operations are disabled.'
                  : 'Platform is active and processing transactions.'}
              </p>
            </div>
            <AdminButton
              label={platformStats.isPaused ? 'Unpause' : 'Pause'}
              loadingLabel={platformStats.isPaused ? 'Resuming…' : 'Pausing…'}
              onClick={handleTogglePause}
              disabled={isRenounced}
              loading={busy('pause')}
              variant={platformStats.isPaused ? 'primary' : 'rose'}
            />
          </div>

          <div className="p-4 rounded-xl bg-accent-amber/5 border border-accent-amber/10">
            <p className="text-accent-amber font-display font-medium text-sm mb-1">⚠ Warning</p>
            <p className="text-text-muted text-xs">
              Pausing the platform prevents all staking, claiming, and unstaking operations. Use only in emergencies.
            </p>
          </div>

          {/* Renounce Ownership */}
          <div className={`p-4 rounded-xl border space-y-3 ${isRenounced ? 'bg-surface-800/20 border-white/5 opacity-60' : 'bg-accent-rose/5 border-accent-rose/20'}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-display font-medium flex items-center gap-2">
                  🔓 Renounce Ownership
                  {isRenounced && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent-rose/10 text-accent-rose border border-accent-rose/20 font-normal">
                      Renounced
                    </span>
                  )}
                </p>
                <p className="text-text-muted text-sm mt-0.5">
                  {isRenounced
                    ? `Ownership permanently renounced. Fee recipient: ${platformStats.feeRecipient?.slice(0, 10)}…`
                    : 'Permanently surrender admin control. Earn 25% passive fees forever. Irreversible.'}
                </p>
              </div>
              <AdminButton
                label="Renounce Ownership"
                loadingLabel="Renouncing…"
                onClick={() => setRenounceConfirm(true)}
                disabled={isRenounced || busy('renounce')}
                loading={busy('renounce')}
                variant="rose"
              />
            </div>
            {!isRenounced && (
              <div className="text-xs text-text-muted p-3 rounded-xl bg-surface-800/40 border border-white/5 space-y-1">
                <p><span className="text-accent-amber">●</span> You will permanently lose all admin privileges.</p>
                <p><span className="text-brand-400">●</span> Burn still applies: 10% of user's gross reward is burned from their share on every claim / compound.</p>
                <p><span className="text-accent-cyan">●</span> Additionally, you receive 25% of gross reward separately from the pool — user's share is untouched by this fee.</p>
                <p><span className="text-accent-purple">●</span> Example: user earns 1 FBiT gross → 0.1 burned → user gets 0.9 FBiT · you get 0.25 FBiT from pool.</p>
                <p><span className="text-accent-rose">●</span> This action cannot be undone, even by deploying a new contract.</p>
              </div>
            )}
          </div>

          {/* Renounce Confirmation Modal */}
          {renounceConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
              <div className="glass-card max-w-md w-full space-y-5 border border-accent-rose/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-rose/20 flex items-center justify-center shrink-0">
                    <span className="text-xl">⚠</span>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-accent-rose">Confirm Renouncement</h3>
                    <p className="text-text-muted text-xs">This action is permanent and irreversible</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-text-secondary">
                  <p>By confirming, you agree to:</p>
                  <ul className="space-y-1.5 text-xs pl-3">
                    <li className="flex items-start gap-2"><span className="text-accent-rose mt-0.5">✕</span> Permanently lose all admin rights — fund pool, set rates, block users, pause platform, update APYs</li>
                    <li className="flex items-start gap-2"><span className="text-accent-amber mt-0.5">🔥</span> Burn still applies: 10% of user's gross reward is burned from their share on every claim / compound</li>
                    <li className="flex items-start gap-2"><span className="text-brand-400 mt-0.5">✓</span> You receive <strong className="text-white">25% of gross reward</strong> from pool — paid separately, no deduction from user (e.g. 1 FBiT gross → 0.9 to user, 0.25 to you from pool)</li>
                    <li className="flex items-start gap-2"><span className="text-brand-400 mt-0.5">✓</span> Fees accumulate indefinitely with no further action required</li>
                  </ul>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRenounceConfirm(false)}
                    className="flex-1 py-3 rounded-xl font-display font-medium text-sm bg-surface-700 text-text-secondary hover:bg-surface-600 transition-colors border border-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRenounceOwnership}
                    className="flex-1 py-3 rounded-xl font-display font-bold text-sm bg-accent-rose/20 text-accent-rose border border-accent-rose/30 hover:bg-accent-rose/30 transition-colors"
                  >
                    Yes, Renounce Permanently
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recent admin transactions */}
          {(walletData?.transactions.filter(t => t.type === 'admin') ?? []).length > 0 && (
            <div>
              <p className="text-xs text-text-muted font-display uppercase tracking-wider mb-2">Recent Admin Actions</p>
              <div className="space-y-1.5">
                {walletData?.transactions.filter(t => t.type === 'admin').slice(0, 5).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-800/40 border border-white/5 text-xs">
                    <span className="text-text-secondary">{tx.label}</span>
                    <span className="text-text-muted font-mono">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminButton({
  label, loadingLabel, onClick, disabled, loading, variant,
}: {
  label: string; loadingLabel: string; onClick: () => void;
  disabled: boolean; loading: boolean; variant: 'primary' | 'purple' | 'cyan' | 'rose' | 'amber' | 'brand';
}) {
  const base = 'py-3 px-6 rounded-xl font-display font-semibold text-sm transition-all flex items-center justify-center gap-2';
  const colors = {
    primary: 'btn-primary',
    purple:  'bg-accent-purple/20 text-accent-purple border border-accent-purple/30 hover:bg-accent-purple/30',
    cyan:    'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30',
    rose:    'bg-accent-rose/10 text-accent-rose border border-accent-rose/20 hover:bg-accent-rose/20',
    amber:   'bg-accent-amber/10 text-accent-amber border border-accent-amber/20 hover:bg-accent-amber/20',
    brand:   'btn-primary',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${disabled || loading ? 'bg-surface-700 text-text-muted cursor-not-allowed border border-white/5' : colors[variant]}`}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {loading ? loadingLabel : label}
    </button>
  );
}
