'use client';

import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useAppStore } from '@/lib/store';
import Header from '@/components/layout/Header';
import Dashboard from '@/components/staking/Dashboard';
import StakePanel from '@/components/staking/StakePanel';
import ReferralPanel from '@/components/referral/ReferralPanel';
import AdminPanel from '@/components/admin/AdminPanel';
import HistoryPanel from '@/components/history/HistoryPanel';

export default function Home() {
  const { activeTab, isAdmin } = useAppStore();

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'stake':     return <StakePanel />;
      case 'referral':  return <ReferralPanel />;
      case 'history':   return <HistoryPanel />;
      case 'admin':     return isAdmin ? <AdminPanel /> : <Dashboard />;
      default:          return <Dashboard />;
    }
  };

  return (
    <>
      {/* Global toast notifications — dark-themed */}
      <Toaster
        position="bottom-right"
        gutter={8}
        toastOptions={{
          duration: 4000,
          style: {
            background: '#162033',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '14px',
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          },
          success: { iconTheme: { primary: '#00E676', secondary: '#0f1729' } },
          error:   { iconTheme: { primary: '#fb7185', secondary: '#0f1729' } },
        }}
      />

      <Header />

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {renderContent()}
      </main>

      <footer className="border-t border-white/5 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-linear-to-br from-brand-500 to-accent-cyan flex items-center justify-center">
                <span className="font-display font-bold text-surface-900 text-[10px]">F</span>
              </div>
              <span className="font-display text-sm text-text-muted">Future Bit (FBiT) Staking Mainnet</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-text-muted">
              <span>Solana + Polygon</span>
              <span>·</span>
              <span>10-Level Referrals</span>
              <span>·</span>
              <span>Up to 500% APY</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
