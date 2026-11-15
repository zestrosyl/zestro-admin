import React from 'react';
import {
  LayoutDashboard,
  UtensilsCrossed,
  FolderTree,
  Images,
  ShoppingBag,
  QrCode,
  BellRing,
  Tag,
  BarChart3,
  Users,
  Settings,
  X,
  LogOut,
} from 'lucide-react';
import { AuthenticatedAdminUser, ModuleId } from '../../types';

export interface NavItem {
  id: ModuleId;
  label: string;
  group: 'Operations' | 'Menu & Content' | 'Insights & Admin';
  icon: React.ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', group: 'Operations', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'orders', label: 'Orders', group: 'Operations', icon: <ShoppingBag className="h-4 w-4" /> },
  { id: 'menu', label: 'Menu Management', group: 'Operations', icon: <UtensilsCrossed className="h-4 w-4" /> },
  { id: 'categories', label: 'Categories', group: 'Operations', icon: <FolderTree className="h-4 w-4" /> },
  { id: 'tables', label: 'Tables & QR Codes', group: 'Operations', icon: <QrCode className="h-4 w-4" /> },
  { id: 'waiter-calls', label: 'Waiter Calls', group: 'Operations', icon: <BellRing className="h-4 w-4" /> },
  { id: 'gallery', label: 'Gallery', group: 'Menu & Content', icon: <Images className="h-4 w-4" /> },
  { id: 'promotions', label: 'Offers', group: 'Menu & Content', icon: <Tag className="h-4 w-4" /> },
  { id: 'reports', label: 'Basic Reports', group: 'Insights & Admin', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'staff', label: 'Staff & Access', group: 'Insights & Admin', icon: <Users className="h-4 w-4" /> },
  { id: 'settings', label: 'Restaurant Settings', group: 'Insights & Admin', icon: <Settings className="h-4 w-4" /> },
];

export const Sidebar: React.FC<{
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  pendingOrdersCount: number;
  incomingWaiterCallsCount: number;
  restaurantName: string;
  currentUser?: AuthenticatedAdminUser | null;
  connected?: boolean;
}> = ({
  activeModule,
  onSelectModule,
  mobileOpen,
  onCloseMobile,
  pendingOrdersCount,
  incomingWaiterCallsCount,
  restaurantName,
  currentUser,
  connected: _connected = false,
}) => {
  const groups: Array<'Operations' | 'Menu & Content' | 'Insights & Admin'> = [
    'Operations',
    'Menu & Content',
    'Insights & Admin',
  ];

  const handleLogout = () => {
    window.location.href = '/cdn-cgi/access/logout';
  };

  const content = (
    <div className="flex h-full flex-col bg-white text-[#111111]">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#111111] text-sm font-bold text-white">
            Z
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-wide text-[#111111]">
                {restaurantName || 'ZESTRO'}
              </span>
              <span className="rounded bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                Admin
              </span>
            </div>
            <p className="text-[11px] text-neutral-500">Bangladesh · BDT (৳)</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-1.5 text-neutral-500 hover:bg-[#F5F5F5] hover:text-[#111111] lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {group}
            </p>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                const active = activeModule === item.id;
                const badgeCount =
                  item.id === 'orders'
                    ? pendingOrdersCount
                    : item.id === 'waiter-calls'
                    ? incomingWaiterCallsCount
                    : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectModule(item.id);
                      onCloseMobile();
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium ${
                      active
                        ? 'bg-[#111111] text-white'
                        : 'text-neutral-600 hover:bg-[#F5F5F5] hover:text-[#111111]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={active ? 'text-[#16A34A]' : 'text-neutral-400'}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </span>
                    {badgeCount > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          active
                            ? 'bg-[#16A34A] text-white'
                            : 'bg-emerald-50 text-[#16A34A]'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {currentUser && (
        <div className="border-t border-[#E5E7EB] p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[#111111]">{currentUser.name}</p>
              <p className="truncate text-[11px] text-neutral-500">{currentUser.uiRole}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              className="rounded-md p-1.5 text-neutral-500 hover:bg-white hover:text-[#111111]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-[#E5E7EB] lg:block">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/35" onClick={onCloseMobile} />
          <aside className="relative z-50 flex h-full w-72 max-w-[85vw] flex-col border-r border-[#E5E7EB] bg-white">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};
