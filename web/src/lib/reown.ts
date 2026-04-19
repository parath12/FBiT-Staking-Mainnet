'use client';

import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import { polygon, solana } from '@reown/appkit/networks';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

// Primary:  dashboard.walletconnect.com
// Fallback: dashboard.reown.com
const PRIMARY_PROJECT_ID  = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID  ?? '';
const FALLBACK_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID_2 ?? '';

const ethersAdapter = new EthersAdapter();

const solanaAdapter = new SolanaAdapter({
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
});

export let appKitModal: ReturnType<typeof createAppKit> | undefined;

if (typeof window !== 'undefined') {
  // Use actual origin in dev (localhost:3000), production URL otherwise
  const siteUrl =
    window.location.hostname === 'localhost'
      ? window.location.origin
      : 'https://fbitstaking.app';

  const config = {
    adapters:       [ethersAdapter, solanaAdapter],
    networks:       [polygon, solana] as [typeof polygon, typeof solana],
    defaultNetwork: polygon,
    metadata: {
      name:        'Future Bit (FBiT) Staking',
      description: 'Multi-Chain FBiT Token Staking & Referral Platform',
      url:         siteUrl,
      icons:       [`${siteUrl}/favicon.ico`],
    },
    features: {
      analytics:        false,
      email:            false,
      socials:          [],
      emailShowWallets: false,
      swaps:            false,
      onramp:           false,
    },
    allWallets: 'SHOW' as const,
    themeMode: 'dark' as const,
    themeVariables: {
      '--w3m-accent':               '#00E5B4',
      '--w3m-border-radius-master': '12px',
      '--w3m-font-family':          'inherit',
      '--w3m-z-index':              9999,
    },
  };

  const ids = [PRIMARY_PROJECT_ID, FALLBACK_PROJECT_ID].filter(Boolean);

  for (const projectId of ids) {
    try {
      appKitModal = createAppKit({ ...config, projectId });
      break;
    } catch (err) {
      console.warn(`[FBiT] WalletConnect init failed (project: ${projectId}):`, err);
    }
  }

  if (!appKitModal) {
    console.warn('[FBiT] WalletConnect unavailable — both project IDs failed to initialize.');
  }
}
