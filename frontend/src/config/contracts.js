export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_MAINNET_CHAIN_ID_HEX = '0x2105';
export const BASE_MAINNET_EXPLORER_BASE_URL = 'https://basescan.org';
export const BASE_SEPOLIA_EXPLORER_BASE_URL = 'https://sepolia.basescan.org';
export const MAINNET_TRANSACTION_CUTOFF = Math.floor(Date.parse('2026-05-11T09:19:21.561Z') / 1000);

export const CONTRACT_ADDRESSES = {
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  stakeRegistry: '0x2589D201414A4658eFED96ea34841fBE31416bb8',
  reputation: '0x713F6aa4D833A1943fE55032ABc647c72501949E',
  escrow: '0xbFeC217471Ea83bBA123f4905C41009F1C2A6339',
};

export const BASE_MAINNET_CONFIG = {
  chainId: BASE_MAINNET_CHAIN_ID,
  chainIdHex: BASE_MAINNET_CHAIN_ID_HEX,
  chainName: 'Base Mainnet',
  badgeLabel: 'BASE',
  explorerBaseUrl: BASE_MAINNET_EXPLORER_BASE_URL,
  rpcUrl: import.meta.env.VITE_BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
  tokenLabel: 'USDC',
  walletConfig: {
    chainId: BASE_MAINNET_CHAIN_ID_HEX,
    chainName: 'Base',
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: [import.meta.env.VITE_BASE_MAINNET_RPC_URL || 'https://mainnet.base.org'],
    blockExplorerUrls: [BASE_MAINNET_EXPLORER_BASE_URL],
  },
  contracts: CONTRACT_ADDRESSES,
};

export function getNetworkConfig() {
  return BASE_MAINNET_CONFIG;
}

export function getContractAddresses() {
  return CONTRACT_ADDRESSES;
}

export function getExplorerBaseUrl() {
  return BASE_MAINNET_EXPLORER_BASE_URL;
}

export function getReadRpcUrl() {
  return BASE_MAINNET_CONFIG.rpcUrl;
}

export function getWalletNetworkConfig() {
  return BASE_MAINNET_CONFIG.walletConfig;
}
