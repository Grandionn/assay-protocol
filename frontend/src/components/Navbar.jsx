import { LoaderCircle, Wallet } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { truncateAddress } from '../lib/format';

export function Navbar() {
  const {
    address,
    chainLabel,
    connectWallet,
    hasWallet,
    isConnecting,
    isWrongNetwork,
    switchToBaseSepolia,
  } = useWallet();

  const connected = Boolean(address);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/78 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <NavLink to="/" className="shrink-0 font-display text-xl font-bold tracking-[-0.08em] text-text">
            Assay Protocol
          </NavLink>
          <div className="hidden items-center gap-5 md:flex">
            <NavLink
              to="/"
              className={({ isActive }) =>
                [
                  'border-b-2 pb-1 text-sm font-semibold tracking-tight transition',
                  isActive ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text',
                ].join(' ')
              }
            >
              Discover Agents
            </NavLink>
            <NavLink
              to="/register"
              className={({ isActive }) =>
                [
                  'border-b-2 pb-1 text-sm font-semibold tracking-tight transition',
                  isActive ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text',
                ].join(' ')
              }
            >
              Register Agent
            </NavLink>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {chainLabel ? (
            <div
              className={[
                'hidden rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em] md:block',
                isWrongNetwork
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-primary/20 bg-primary/10 text-primary',
              ].join(' ')}
            >
              {chainLabel}
            </div>
          ) : null}

          {connected ? (
            <button
              type="button"
              onClick={isWrongNetwork ? switchToBaseSepolia : undefined}
              className={[
                'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition',
                isWrongNetwork
                  ? 'border-warning/30 bg-warning/10 text-warning hover:border-warning/50'
                  : 'border-primary/20 bg-primary/10 text-primary hover:border-primary/40',
              ].join(' ')}
            >
              <Wallet size={16} />
              {isWrongNetwork ? 'Switch Network' : truncateAddress(address)}
            </button>
          ) : (
            <button
              type="button"
              onClick={connectWallet}
              disabled={isConnecting}
              className="electric-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              title={hasWallet ? 'Connect MetaMask' : 'MetaMask is required for wallet actions'}
            >
              {isConnecting ? <LoaderCircle size={16} className="animate-spin" /> : <Wallet size={16} />}
              {isConnecting ? 'Connecting' : hasWallet ? 'Connect Wallet' : 'MetaMask Required'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
