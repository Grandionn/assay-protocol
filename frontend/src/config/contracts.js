export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const DEFAULT_CHAIN_ID = BASE_MAINNET_CHAIN_ID;

export const NETWORK_CONFIGS = {
  [BASE_MAINNET_CHAIN_ID]: {
    chainId: BASE_MAINNET_CHAIN_ID,
    chainIdHex: '0x2105',
    chainName: 'Base',
    badgeLabel: 'BASE',
    explorerBaseUrl: 'https://basescan.org',
    rpcUrl: import.meta.env.VITE_BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    tokenLabel: 'USDC',
    isTestnet: false,
    walletConfig: {
      chainId: '0x2105',
      chainName: 'Base',
      nativeCurrency: {
        name: 'ETH',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: [import.meta.env.VITE_BASE_MAINNET_RPC_URL || 'https://mainnet.base.org'],
      blockExplorerUrls: ['https://basescan.org'],
    },
    contracts: {
      usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      stakeRegistry: '0x2589D201414A4658eFED96ea34841fBE31416bb8',
      reputation: '0x713F6aa4D833A1943fE55032ABc647c72501949E',
      escrow: '0xC0Ce47838aCF7Dfb77ae3a6161B552604Ae8aaEe',
    },
  },
  [BASE_SEPOLIA_CHAIN_ID]: {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    chainIdHex: '0x14A34',
    chainName: 'Base Sepolia',
    badgeLabel: 'BASE SEPOLIA',
    explorerBaseUrl: 'https://sepolia.basescan.org',
    rpcUrl: import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || import.meta.env.VITE_ALCHEMY_RPC_URL || 'https://sepolia.base.org',
    tokenLabel: 'Mock USDC',
    isTestnet: true,
    walletConfig: {
      chainId: '0x14A34',
      chainName: 'Base Sepolia',
      nativeCurrency: {
        name: 'ETH',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: [import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || import.meta.env.VITE_ALCHEMY_RPC_URL || 'https://sepolia.base.org'],
      blockExplorerUrls: ['https://sepolia.basescan.org'],
    },
    contracts: {
      usdc: '0x0e645C8f28c2B0511CCb29B1b22b899ADcd7e256',
      stakeRegistry: '0x20ddFAedc1Fca9Bbd5d660384bf24cCbeEB1d7f9',
      reputation: '0xD6a81ADd33398A777640787b2f48D7A33D46fbab',
      escrow: '0x17E177d698A244E13f84446982BA772eBdCed567',
    },
  },
};

export function isSupportedChainId(chainId) {
  return Number.isInteger(chainId) && Object.prototype.hasOwnProperty.call(NETWORK_CONFIGS, chainId);
}

export function getNetworkConfig(chainId = DEFAULT_CHAIN_ID) {
  return NETWORK_CONFIGS[chainId] ?? NETWORK_CONFIGS[DEFAULT_CHAIN_ID];
}

export function getContractAddresses(chainId = DEFAULT_CHAIN_ID) {
  return getNetworkConfig(chainId).contracts;
}

export function getExplorerBaseUrl(chainId = DEFAULT_CHAIN_ID) {
  return getNetworkConfig(chainId).explorerBaseUrl;
}

export function getReadRpcUrl(chainId = DEFAULT_CHAIN_ID) {
  return getNetworkConfig(chainId).rpcUrl;
}

export function getWalletNetworkConfig(chainId = DEFAULT_CHAIN_ID) {
  return getNetworkConfig(chainId).walletConfig;
}
