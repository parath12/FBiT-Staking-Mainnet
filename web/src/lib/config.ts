import { NetworkConfig } from '@/types';

// ===== MAINNET CONFIGURATION =====
export const NETWORK_CONFIG: Record<string, NetworkConfig> = {
  solana: {
    name: 'Solana',
    type: 'solana',
    rpcUrl:             process.env.NEXT_PUBLIC_SOLANA_RPC_URL          ?? 'https://solana-mainnet.publicnode.com',
    explorerUrl:        'https://explorer.solana.com',
    contractAddress:    process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID       ?? '',
    stakeTokenAddress:  process.env.NEXT_PUBLIC_SOLANA_STAKE_TOKEN_MINT ?? '',
    rewardTokenAddress: process.env.NEXT_PUBLIC_SOLANA_REWARD_TOKEN_MINT ?? '',
    stakeTokenSymbol:   'FBiT',
    stakeTokenDecimals: 6,
    stakeVaultAddress:  process.env.NEXT_PUBLIC_SOLANA_STAKE_VAULT,
    rewardVaultAddress: process.env.NEXT_PUBLIC_SOLANA_REWARD_VAULT,
  },
  polygon: {
    name: 'Polygon',
    type: 'polygon',
    rpcUrl:             process.env.NEXT_PUBLIC_POLYGON_RPC_URL          ?? 'https://polygon-bor-rpc.publicnode.com',
    chainId:            Number(process.env.NEXT_PUBLIC_POLYGON_CHAIN_ID  ?? '137'),
    explorerUrl:        'https://polygonscan.com',
    contractAddress:    process.env.NEXT_PUBLIC_POLYGON_CONTRACT_ADDRESS ?? '',
    stakeTokenAddress:  process.env.NEXT_PUBLIC_POLYGON_STAKE_TOKEN      ?? '',
    rewardTokenAddress: process.env.NEXT_PUBLIC_POLYGON_REWARD_TOKEN     ?? '',
    stakeTokenSymbol:   'FBiT',
    stakeTokenDecimals: 6,
  },
};

export const getExplorerTxUrl = (network: string, txHash: string): string => {
  const config = NETWORK_CONFIG[network];
  return `${config?.explorerUrl ?? 'https://explorer.solana.com'}/tx/${txHash}`;
};
