import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { getContracts } from '../lib/contracts';

const BASE_SEPOLIA = {
  chainId: '0x14A34',
  chainName: 'Base Sepolia',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const readProvider = useMemo(
    () => new ethers.JsonRpcProvider(import.meta.env.VITE_ALCHEMY_RPC_URL || 'https://sepolia.base.org'),
    [],
  );
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState('');
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRegisteredAgent, setIsRegisteredAgent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!window.ethereum) {
      return undefined;
    }

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    setProvider(browserProvider);

    async function syncWalletState(accountsOverride) {
      try {
        const accounts =
          accountsOverride ?? (await window.ethereum.request({ method: 'eth_accounts' }));
        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));

        if (accounts.length === 0) {
          setAddress('');
          setSigner(null);
          return;
        }

        const nextSigner = await browserProvider.getSigner();
        setSigner(nextSigner);
        setAddress(ethers.getAddress(accounts[0]));
      } catch (syncError) {
        setError(syncError?.shortMessage ?? syncError?.message ?? 'Unable to read wallet state.');
      }
    }

    syncWalletState();

    function handleAccountsChanged(accounts) {
      syncWalletState(accounts);
    }

    function handleChainChanged(nextChainId) {
      setChainId(parseInt(nextChainId, 16));
      syncWalletState();
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const checkAgentRegistration = async () => {
      if (!address || !readProvider) {
        if (!ignore) {
          setIsRegisteredAgent(false);
        }
        return;
      }

      try {
        const { stakeRegistry } = getContracts(readProvider);
        const active = await stakeRegistry.isActive(address);
        if (!ignore) {
          setIsRegisteredAgent(Boolean(active));
        }
      } catch {
        if (!ignore) {
          setIsRegisteredAgent(false);
        }
      }
    };

    checkAgentRegistration();

    return () => {
      ignore = true;
    };
  }, [address, readProvider]);

  async function connectWallet() {
    if (!window.ethereum) {
      setError('MetaMask is required for wallet connections.');
      return;
    }

    try {
      setIsConnecting(true);
      setError('');

      const browserProvider = provider ?? new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const nextSigner = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();

      setSigner(nextSigner);
      setAddress(ethers.getAddress(accounts[0]));
      setChainId(Number(network.chainId));
    } catch (connectError) {
      setError(connectError?.shortMessage ?? connectError?.message ?? 'Wallet connection failed.');
    } finally {
      setIsConnecting(false);
    }
  }

  async function switchToBaseSepolia() {
    if (!window.ethereum) {
      setError('MetaMask is required to switch networks.');
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_SEPOLIA.chainId }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [BASE_SEPOLIA],
        });
      } else {
        setError(switchError?.shortMessage ?? switchError?.message ?? 'Unable to switch network.');
      }
    }
  }

  const value = {
    provider,
    readProvider,
    signer,
    address,
    chainId,
    chainLabel: chainId ? (chainId === 84532 ? 'Base Sepolia' : `Chain ${chainId}`) : '',
    isWrongNetwork: Boolean(chainId) && chainId !== 84532,
    isConnecting,
    isRegisteredAgent,
    connectWallet,
    switchToBaseSepolia,
    hasWallet: Boolean(window.ethereum),
    error,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error('useWallet must be used within WalletProvider.');
  }

  return context;
}
