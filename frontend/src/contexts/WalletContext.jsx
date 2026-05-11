import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import {
  BASE_MAINNET_CHAIN_ID,
  getExplorerBaseUrl,
  getNetworkConfig,
  getReadRpcUrl,
  getWalletNetworkConfig,
} from '../config/contracts';
import { getContracts } from '../lib/contracts';

const WalletContext = createContext(null);
const WRONG_NETWORK_MESSAGE = 'Switch to Base Mainnet to use Assay on-chain actions.';

export function WalletProvider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState('');
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRegisteredAgent, setIsRegisteredAgent] = useState(false);
  const [error, setError] = useState('');
  const readProvider = useMemo(() => new ethers.JsonRpcProvider(getReadRpcUrl()), []);
  const connectedNetwork = getNetworkConfig();
  const isMainnet = chainId === BASE_MAINNET_CHAIN_ID;
  const isWrongNetwork = Boolean(address) && chainId !== BASE_MAINNET_CHAIN_ID;

  function resetWalletState() {
    setSigner(null);
    setAddress('');
    setChainId(null);
    setIsRegisteredAgent(false);
    setIsConnecting(false);
    setError('');
  }

  useEffect(() => {
    if (!window.ethereum) {
      return undefined;
    }

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    setProvider(browserProvider);

    async function syncWalletState(accountsOverride) {
      try {
        setError('');
        const accounts =
          accountsOverride ?? (await window.ethereum.request({ method: 'eth_accounts' }));

        if (accounts.length === 0) {
          resetWalletState();
          return;
        }

        const network = await browserProvider.getNetwork();
        setChainId(Number(network.chainId));
        const nextSigner = await browserProvider.getSigner();
        setSigner(nextSigner);
        setAddress(ethers.getAddress(accounts[0]));
      } catch (syncError) {
        const syncMessage = syncError?.shortMessage ?? syncError?.message ?? '';
        if (syncMessage.toLowerCase().includes('network changed')) {
          setError('');
          return;
        }

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

    function handleDisconnect() {
      resetWalletState();
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    window.ethereum.on('disconnect', handleDisconnect);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
      window.ethereum.removeListener('disconnect', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    if (!address) {
      setError((current) => (current === WRONG_NETWORK_MESSAGE ? '' : current));
      return;
    }

    if (chainId !== BASE_MAINNET_CHAIN_ID) {
      setError(WRONG_NETWORK_MESSAGE);
      return;
    }

    setError((current) => (current === WRONG_NETWORK_MESSAGE ? '' : current));
  }, [address, chainId]);

  useEffect(() => {
    let ignore = false;

    const checkAgentRegistration = async () => {
      if (!address || !readProvider || isWrongNetwork) {
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
  }, [address, isWrongNetwork, readProvider]);

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

  async function switchToBase() {
    if (!window.ethereum) {
      setError('MetaMask is required to switch networks.');
      return;
    }

    const baseMainnetConfig = getWalletNetworkConfig(BASE_MAINNET_CHAIN_ID);

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: baseMainnetConfig.chainId }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [baseMainnetConfig],
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
    readChainId: BASE_MAINNET_CHAIN_ID,
    chainLabel: address && isMainnet ? connectedNetwork.badgeLabel : '',
    chainName: connectedNetwork.chainName,
    explorerBaseUrl: getExplorerBaseUrl(),
    isMainnet,
    isWrongNetwork,
    isConnecting,
    isRegisteredAgent,
    connectWallet,
    switchToBase,
    hasWallet: typeof window !== 'undefined' && Boolean(window.ethereum),
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
