import { LayoutGrid, LineChart, ReceiptText, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

const mobileNavItems = [
  { label: 'Dashboard', to: '/', icon: LayoutGrid },
  { label: 'Registry', to: '/register', icon: ReceiptText },
  { label: 'Analytics', to: '/analytics', icon: LineChart },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export function AppShell() {
  return (
    <div className="app-backdrop min-h-screen bg-shell text-text">
      <Navbar />
      <Sidebar />
      <main className="px-4 pb-12 pt-24 md:px-6 md:pl-24 xl:pl-80">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
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
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
