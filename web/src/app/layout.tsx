import '@/styles/globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { WalletProvider } from '@/context/WalletContext';
import { AppKitProvider } from '@/providers/AppKitProvider';
import ExtensionErrorSuppressor from '@/components/ExtensionErrorSuppressor';

export const metadata: Metadata = {
  title: 'Future Bit (FBiT) Staking Mainnet | Multi-Chain Staking & Referral Platform',
  description: 'Stake FBiT tokens across Solana and Polygon networks. Earn rewards with 60%–500% PoS APY and build your referral network with 10-level commissions.',
  keywords: 'FBiT, staking, DeFi, Solana, Polygon, referral, crypto, yield farming',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

const suppressExtensionErrors = `(function(){
  function isExt(s){return s&&(s.includes('chrome-extension://')||s.includes('moz-extension://'));}
  var MSGS=['Origin not allowed','Extension context invalidated'];
  function isExtErr(r){if(!r)return false;var s=r.stack||'';var m=r.message||String(r);return isExt(s)||MSGS.some(function(x){return m.includes(x);});}
  window.addEventListener('unhandledrejection',function(e){if(isExtErr(e.reason)){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('error',function(e){if(isExt(e.filename||'')||isExtErr(e.error)){e.preventDefault();e.stopImmediatePropagation();}},true);
  var _ce=console.error.bind(console);
  console.error=function(){var a=Array.prototype.slice.call(arguments).map(function(x){return typeof x==='string'?x:(x&&(x.stack||x.message))||String(x);}).join(' ');if(isExt(a)||MSGS.some(function(m){return a.includes(m);}))return;_ce.apply(console,arguments);};
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: suppressExtensionErrors }} />
      </head>
      <body className="antialiased">
        <ExtensionErrorSuppressor />
        <AppKitProvider>
          <WalletProvider>
            <div className="bg-mesh fixed inset-0" />
            <div className="grid-pattern fixed inset-0" />
            <div className="relative z-10 min-h-screen">
              {children}
            </div>
          </WalletProvider>
        </AppKitProvider>
      </body>
    </html>
  );
}
