import { FileText, LayoutGrid, ReceiptText, User } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

const mobileNavItems = [
  { label: 'Discover', to: '/discover', icon: LayoutGrid },
  { label: 'Register', to: '/register', icon: ReceiptText },
  { label: 'My Escrows', to: '/escrows', icon: FileText },
];

export function AppShell() {
  const location = useLocation();
  const { address } = useWallet();
  const isLandingPage = location.pathname === '/';

  return (
    <div className="app-backdrop min-h-screen bg-shell text-text">
      <Navbar />
      {!isLandingPage ? <Sidebar /> : null}
      <main className={isLandingPage ? 'pb-0 pt-[72px]' : 'px-4 pb-12 pt-24 md:px-6 md:pl-24 xl:pl-80'}>
        <div className={isLandingPage ? '' : 'mx-auto flex max-w-7xl flex-col gap-6'}>
          {!isLandingPage ? (
            <div className="panel-subtle flex items-center gap-2 overflow-x-auto rounded-2xl px-3 py-3 md:hidden">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'flex min-w-fit items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition',
                        isActive
                          ? 'border-primary/50 bg-primary/12 text-primary'
                          : 'border-white/5 bg-white/2 text-muted hover:border-primary/20 hover:text-text',
                      ].join(' ')
                    }
                  >
                    <Icon size={14} />
                    {item.label}
                  </NavLink>
                );
              })}
              {address ? (
                <NavLink
                  to={`/agent/${address}`}
                  className={({ isActive }) =>
                    [
                      'flex min-w-fit items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition',
                      isActive
                        ? 'border-primary/50 bg-primary/12 text-primary'
                        : 'border-white/5 bg-white/2 text-muted hover:border-primary/20 hover:text-text',
                    ].join(' ')
                  }
                >
                  <User size={14} />
                  My Agent
                </NavLink>
              ) : null}
            </div>
          ) : null}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
