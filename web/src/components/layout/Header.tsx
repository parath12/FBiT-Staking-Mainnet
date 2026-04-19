'use client';

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useWallet } from '@/context/WalletContext';
import { useAppStore } from '@/lib/store';
import { shortenAddress } from '@/lib/utils';
import TokenLogo from '@/components/ui/TokenLogo';

function isValidSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function isValidEVMAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function ReferralGateModal({
  network,
  onConfirm,
}: {
  network: 'solana' | 'polygon';
  onConfirm: (referralAddress: string) => void;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const trimmed = input.trim();
  const valid = network === 'solana' ? isValidSolanaAddress(trimmed) : isValidEVMAddress(trimmed);
  const networkLabel = network === 'solana' ? 'Solana' : 'Polygon';
  const placeholder  = network === 'solana' ? 'Solana wallet address (base58)' : 'Polygon wallet address (0x...)';
  const wrongFormat  = network === 'solana'
    ? 'Enter a valid Solana address (base58 format).'
    : 'Enter a valid Polygon address (0x... format).';

  const handleSubmit = () => {
    if (!trimmed) { setError('Referral address required.'); return; }
    if (!valid) { setError(wrongFormat); return; }
    setError('');
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="glass rounded-2xl border border-brand-500/20 w-full max-w-md p-6 animate-slide-up shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-brand-500/30 to-accent-cyan/30 flex items-center justify-center text-xl shrink-0">
            ◎
          </div>
          <div>
            <h2 className="font-display font-bold text-lg leading-tight">Referral Required</h2>
            <p className="text-text-muted text-xs">FBiT Staking is invite-only</p>
          </div>
        </div>

        <p className="text-text-secondary text-sm mb-5 leading-relaxed">
          To join <span className="text-brand-400 font-medium">Future Bit (FBiT) Staking</span>, you need a referral from an existing member. Enter their <span className="text-brand-400 font-medium">{networkLabel}</span> wallet address to continue.
        </p>

        {/* Input */}
        <div className="mb-4">
          <label className="text-xs text-text-muted font-display uppercase tracking-wider mb-2 block">
            {networkLabel} Referral Wallet Address
          </label>
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={placeholder}
            className="input-field w-full font-mono text-sm"
            autoFocus
            spellCheck={false}
          />
          {error && (
            <p className="text-accent-rose text-xs mt-1.5">{error}</p>
          )}
          {trimmed && !error && (
            <p className={`text-xs mt-1.5 ${valid ? 'text-brand-400' : 'text-accent-amber'}`}>
              {valid ? `✓ Valid ${networkLabel} address` : `Invalid — must be a ${networkLabel} address`}
            </p>
          )}
        </div>

        {/* Connect button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!valid}
          className={`w-full py-3 rounded-xl font-display font-bold text-sm transition-all duration-300 ${
            valid ? 'btn-primary' : 'bg-surface-700 text-text-muted cursor-not-allowed'
          }`}
        >
          Connect Wallet
        </button>

        <p className="text-center text-text-muted text-xs mt-3">
          Don't have a referral? Ask an existing FBiT member for their {networkLabel} wallet address.
        </p>
      </div>
    </div>
  );
}

export default function Header() {
  const { connect, adminConnect, disconnect, address, isConnecting, solanaReferrer, polygonReferrer, setSolanaReferrer, setPolygonReferrer } = useWallet();
  const { selectedNetwork, setSelectedNetwork, activeTab, setActiveTab, isAdmin, walletAddress, walletStates } = useAppStore();
  const currentReferrer = selectedNetwork === 'solana' ? solanaReferrer : polygonReferrer;
  const referralCount = walletAddress
    ? (walletStates[walletAddress]?.referralInfo?.totalReferrals ?? walletStates[walletAddress]?.userAccount?.referralCount ?? 0)
    : 0;
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showReferralGate, setShowReferralGate] = useState(false);
  const [showAdminConfirm, setShowAdminConfirm] = useState(false);

  // Close wallet menu once an address is set (handles Reown async connect)
  useEffect(() => {
    if (address) { setShowWalletMenu(false); setShowReferralGate(false); setShowAdminConfirm(false); }
  }, [address]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '◈' },
    { id: 'stake',     label: 'Stake',     icon: '⬡' },
    { id: 'referral',  label: 'Referral',  icon: '◎' },
    { id: 'history',   label: 'History',   icon: '📋' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: '⚙' }] : []),
  ];

  const handleConnect = async () => {
    if (!currentReferrer) {
      setShowReferralGate(true);
      return;
    }
    try {
      await connect('reown');
    } catch (err: any) {
      toast.error(err?.message ?? 'Wallet connection failed.');
    }
  };

  const handleReferralConfirmed = async (referralAddress: string) => {
    if (selectedNetwork === 'solana') {
      setSolanaReferrer(referralAddress);
    } else {
      setPolygonReferrer(referralAddress);
    }
    setShowReferralGate(false);
    try {
      await connect('reown');
    } catch (err: any) {
      toast.error(err?.message ?? 'Wallet connection failed.');
    }
  };

  const handleAdminConnect = async () => {
    setShowAdminConfirm(false);
    try {
      await adminConnect();
    } catch (err: any) {
      toast.error(err?.message ?? 'Admin wallet connection failed.');
    }
  };

  const handleNetworkSwitch = (network: 'solana' | 'polygon') => {
    if (network === selectedNetwork) return;
    if (address) disconnect();
    setSelectedNetwork(network);
    setShowWalletMenu(false);
  };

  return (
    <>
    {showReferralGate && <ReferralGateModal network={selectedNetwork} onConfirm={handleReferralConfirmed} />}
    {showAdminConfirm && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <div className="glass rounded-2xl border border-accent-amber/20 w-full max-w-sm p-6 animate-slide-up shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent-amber/20 flex items-center justify-center text-xl shrink-0">⚙</div>
            <div>
              <h2 className="font-display font-bold text-lg leading-tight">Admin Login</h2>
              <p className="text-text-muted text-xs">Restricted access</p>
            </div>
          </div>
          <p className="text-text-secondary text-sm mb-5 leading-relaxed">
            Connect your <span className="text-accent-amber font-medium">admin wallet</span>. If the connected wallet is not an admin address, it will be disconnected automatically.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowAdminConfirm(false)}
              className="flex-1 py-2.5 rounded-xl font-display font-bold text-sm bg-surface-700 text-text-muted hover:bg-surface-600 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdminConnect}
              className="flex-1 py-2.5 rounded-xl font-display font-bold text-sm bg-accent-amber/20 text-accent-amber border border-accent-amber/30 hover:bg-accent-amber/30 transition-all"
            >
              Connect Admin
            </button>
          </div>
        </div>
      </div>
    )}
    <header className="sticky top-0 z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <TokenLogo size="md" showLiveDot />
            <div className="hidden sm:block">
              <h1 className="font-display font-bold text-lg leading-tight">Future Bit (FBiT) Staking Mainnet</h1>
              <p className="text-[10px] text-text-secondary font-mono tracking-wider uppercase">Multi-Chain Protocol</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-4 py-2 rounded-lg font-display text-sm transition-all duration-200 flex items-center gap-2 relative ${
                  activeTab === item.id
                    ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`}
              >
                <span className="text-xs">{item.icon}</span>
                {item.label}
                {item.id === 'referral' && referralCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-purple/20 text-accent-purple border border-accent-purple/30 leading-none">
                    {referralCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Network Selector */}
            <div className="flex items-center bg-surface-800 rounded-xl border border-white/5 overflow-hidden">
              <button
                type="button"
                onClick={() => handleNetworkSwitch('solana')}
                className={`px-3 py-1.5 text-xs font-display font-medium transition-all ${
                  selectedNetwork === 'solana'
                    ? 'bg-accent-purple/20 text-accent-purple'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                SOL
              </button>
              <div className="w-px h-5 bg-white/5" />
              <button
                type="button"
                onClick={() => handleNetworkSwitch('polygon')}
                className={`px-3 py-1.5 text-xs font-display font-medium transition-all ${
                  selectedNetwork === 'polygon'
                    ? 'bg-accent-purple/20 text-[#8247E5]'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                POLY
              </button>
            </div>

            {/* Wallet */}
            {address ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowWalletMenu(!showWalletMenu)}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-surface-800 border border-white/10 hover:border-brand-500/30 transition-all"
                >
                  <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                  <span className="font-mono text-xs sm:text-sm">{shortenAddress(address)}</span>
                </button>
                {showWalletMenu && (
                  <div className="absolute right-0 top-full mt-2 glass rounded-xl p-2 min-w-45 animate-slide-up">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(address);
                        toast.success('Address copied!');
                        setShowWalletMenu(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-text-secondary hover:bg-white/5 rounded-lg transition-colors"
                    >
                      Copy Address
                    </button>
                    <button
                      type="button"
                      onClick={() => { disconnect(); setShowWalletMenu(false); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-accent-rose hover:bg-accent-rose/10 rounded-lg transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="btn-primary text-xs sm:text-sm px-4 sm:px-6 py-2 sm:py-2.5"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminConfirm(true)}
                  disabled={isConnecting}
                  title="Admin Login"
                  className="px-2.5 py-2 sm:py-2.5 rounded-xl text-xs font-display font-medium border border-accent-amber/20 text-accent-amber/60 hover:border-accent-amber/50 hover:text-accent-amber hover:bg-accent-amber/10 transition-all"
                >
                  ⚙
                </button>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              type="button"
              title="Toggle menu"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span className={`block h-0.5 bg-text-secondary transition-all ${showMobileMenu ? 'rotate-45 translate-y-1.5' : ''}`} />
                <span className={`block h-0.5 bg-text-secondary transition-all ${showMobileMenu ? 'opacity-0' : ''}`} />
                <span className={`block h-0.5 bg-text-secondary transition-all ${showMobileMenu ? '-rotate-45 -translate-y-1.5' : ''}`} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {showMobileMenu && (
          <nav className="md:hidden pb-4 animate-slide-up">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setShowMobileMenu(false); }}
                  className={`px-4 py-3 rounded-xl font-display text-sm text-left transition-all flex items-center gap-3 ${
                    activeTab === item.id
                      ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                  {item.id === 'referral' && referralCount > 0 && (
                    <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-purple/20 text-accent-purple border border-accent-purple/30">
                      {referralCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
    </>
  );
}
