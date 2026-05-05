import { LoaderCircle, Menu, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { truncateAddress } from '../lib/format';

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
  const navLinkClassName = ({ isActive }) =>
    [
      'border-b-2 pb-1 text-sm font-semibold tracking-tight transition',
      isActive ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text',
    ].join(' ');
  const mobileNavLinkClassName = ({ isActive }) =>
    [
      'block w-full px-6 py-3 text-sm font-semibold tracking-tight transition',
      isActive ? 'text-primary' : 'text-muted hover:text-text',
    ].join(' ');
  const badgeClassName = [
    'rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em]',
    isWrongNetwork ? 'border-warning/30 bg-warning/10 text-warning' : 'border-primary/20 bg-primary/10 text-primary',
  ].join(' ');
  const connectedButtonClassName = [
    'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition',
    isWrongNetwork
      ? 'border-warning/30 bg-warning/10 text-warning hover:border-warning/50'
      : 'border-primary/20 bg-primary/10 text-primary hover:border-primary/40',
  ].join(' ');
  const walletButtonLabel = isConnecting ? 'Connecting' : hasWallet ? 'Connect Wallet' : 'MetaMask Required';

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/78 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link to="/" className="shrink-0">
            <img src="/assay_no_bg.png" alt="Assay" className="h-8" />
          </Link>
          <div className="hidden items-center gap-5 md:flex">
            <NavLink to="/discover" className={navLinkClassName}>
              Discover Agents
            </NavLink>
            <NavLink to="/register" className={navLinkClassName}>
              Register Agent
            </NavLink>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="text-muted transition hover:text-text md:hidden"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {chainLabel ? (
            <div
              className={`hidden md:block ${badgeClassName}`}
            >
              {chainLabel}
            </div>
          ) : null}

          {connected ? (
            <button
              type="button"
              onClick={isWrongNetwork ? switchToBaseSepolia : undefined}
              className={`hidden md:flex ${connectedButtonClassName}`}
            >
              <Wallet size={16} />
              {isWrongNetwork ? 'Switch Network' : truncateAddress(address)}
            </button>
          ) : (
            <button
              type="button"
              onClick={connectWallet}
              disabled={isConnecting}
              className="electric-button hidden items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 md:inline-flex"
              title={hasWallet ? 'Connect MetaMask' : 'MetaMask is required for wallet actions'}
            >
              {isConnecting ? <LoaderCircle size={16} className="animate-spin" /> : <Wallet size={16} />}
              {walletButtonLabel}
            </button>
          )}
        </div>
      </div>

      <div
        className={[
          'overflow-hidden transition-all duration-200 ease-out md:hidden',
          isMobileMenuOpen ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none',
        ].join(' ')}
      >
        <div className="border-t border-white/10 bg-background/78 backdrop-blur-xl">
          <NavLink to="/discover" className={mobileNavLinkClassName} onClick={() => setIsMobileMenuOpen(false)}>
            Discover Agents
          </NavLink>
          <NavLink to="/register" className={mobileNavLinkClassName} onClick={() => setIsMobileMenuOpen(false)}>
            Register Agent
          </NavLink>
          <NavLink to="/escrows" className={mobileNavLinkClassName} onClick={() => setIsMobileMenuOpen(false)}>
            My Escrows
          </NavLink>
          <a
            href="/Assay_Whitepaper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full px-6 py-3 text-sm font-semibold tracking-tight text-muted transition hover:text-text"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Whitepaper
          </a>
          <div className="mx-6 my-2 border-t border-white/10" />
          {chainLabel ? (
            <div className="px-6 pb-3">
              <div className={`inline-flex ${badgeClassName}`}>{chainLabel}</div>
            </div>
          ) : null}
          <div className="px-6 pb-4">
            {connected ? (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  if (isWrongNetwork) {
                    switchToBaseSepolia();
                  }
                }}
                className={`flex w-full items-center justify-center ${connectedButtonClassName}`}
              >
                <Wallet size={16} />
                {isWrongNetwork ? 'Switch Network' : truncateAddress(address)}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  connectWallet();
                }}
                disabled={isConnecting}
                className="electric-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                title={hasWallet ? 'Connect MetaMask' : 'MetaMask is required for wallet actions'}
              >
                {isConnecting ? <LoaderCircle size={16} className="animate-spin" /> : <Wallet size={16} />}
                {walletButtonLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
