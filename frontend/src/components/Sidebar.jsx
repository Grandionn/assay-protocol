import {
  FileText,
  LayoutGrid,
  ReceiptText,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

const primaryItems = [
  { label: 'Discover', to: '/discover', icon: LayoutGrid },
  { label: 'Register', to: '/register', icon: ReceiptText },
  { label: 'My Escrows', to: '/escrows', icon: FileText },
];

export function Sidebar() {
  return (
    <aside className="fixed bottom-0 left-0 top-[72px] hidden w-20 border-r border-white/5 bg-surface/88 px-3 py-6 backdrop-blur-xl md:flex xl:w-72 xl:px-5">
      <div className="flex h-full w-full flex-col">
        <nav className="space-y-2">
          {primaryItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition xl:px-4',
                    isActive
                      ? 'translate-x-1 border-primary/45 bg-primary/12 text-primary'
                      : 'border-transparent bg-transparent text-muted hover:border-white/5 hover:bg-white/3 hover:text-text',
                  ].join(' ')
                }
              >
                <Icon size={18} />
                <span className="hidden xl:block">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
