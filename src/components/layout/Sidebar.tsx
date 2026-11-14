import React from 'react';
import {
  LayoutDashboard,
  UtensilsCrossed,
  FolderTree,
  Image as ImageIcon,
  Monitor,
  Images,
  ShoppingBag,
  QrCode,
  BellRing,
  Tag,
  Users,
  Settings,
  X,
  Sparkles,
} from 'lucide-react';
import { AuthenticatedAdminUser, ModuleId } from '../../types';

export interface NavItem {
  id: ModuleId;
  label: string;
  group: 'Operations' | 'Menu & Media' | 'Growth & Team';
  icon: React.ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', group: 'Operations', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'orders', label: 'Orders', group: 'Operations', icon: <ShoppingBag className="h-4 w-4" /> },
  { id: 'tables', label: 'Table Management', group: 'Operations', icon: <QrCode className="h-4 w-4" /> },
  { id: 'waiter-calls', label: 'Waiter Calls', group: 'Operations', icon: <BellRing className="h-4 w-4" /> },
  { id: 'menu', label: 'Menu Management', group: 'Menu & Media', icon: <UtensilsCrossed className="h-4 w-4" /> },
  { id: 'categories', label: 'Categories', group: 'Menu & Media', icon: <FolderTree className="h-4 w-4" /> },
  { id: 'images', label: 'Image Library', group: 'Menu & Media', icon: <ImageIcon className="h-4 w-4" /> },
  { id: 'homepage', label: 'Homepage Editor', group: 'Menu & Media', icon: <Monitor className="h-4 w-4" /> },
  { id: 'gallery', label: 'Gallery', group: 'Menu & Media', icon: <Images className="h-4 w-4" /> },
  { id: 'promotions', label: 'Promotions', group: 'Growth & Team', icon: <Tag className="h-4 w-4" /> },
  { id: 'staff', label: 'Staff Management', group: 'Growth & Team', icon: <Users className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', group: 'Growth & Team', icon: <Settings className="h-4 w-4" /> },
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
  connected = false,
}) => {
  const groups: Array<'Operations' | 'Menu & Media' | 'Growth & Team'> = [
    'Operations',
    'Menu & Media',
    'Growth & Team',
  ];

  const content = (
    <div className="flex h-full flex-col bg-[#101B17] text-[#F3EBDD]">
      <div className="flex items-center justify-between border-b border-[#2C3D34] px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D7A65A]/40 bg-[#1D2922] text-[#D7A65A]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="font-serif text-base font-bold tracking-wider text-[#F3EBDD]">
              {restaurantName} <span className="text-[#D7A65A]">ADMIN</span>
            </p>
            <p className="text-[11px] text-[#F3EBDD]/55">Restaurant Operations</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-1.5 text-[#F3EBDD]/60 hover:bg-[#1D2922] lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#D7A65A]/75">
              {group}
            </p>
            <div className="space-y-1">
              {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
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
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? 'border border-[#D7A65A]/40 bg-[#1D2922] text-[#D7A65A] shadow-sm'
                        : 'border border-transparent text-[#F3EBDD]/75 hover:bg-[#1D2922]/60 hover:text-[#F3EBDD]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                    {badgeCount > 0 && (
                      <span className="rounded-full bg-[#D7A65A] px-2 py-0.5 text-[11px] font-bold text-[#101B17]">
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

      <div className="border-t border-[#2C3D34] p-4">
        <div className="rounded-xl border border-[#2C3D34] bg-[#1D2922] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-[#F3EBDD]">
              {connected ? 'LIVE CLOUD · D1 + R2' : 'CLOUD DISCONNECTED'}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>
          {currentUser ? (
            <p className="mt-1 truncate text-[11px] text-[#F3EBDD]/65">
              {currentUser.name} · <span className="text-[#D7A65A]">{currentUser.uiRole}</span>
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-[#F3EBDD]/55">
              Verifying Cloudflare Access session...
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-[#2C3D34] lg:block">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onCloseMobile} />
          <aside className="relative z-50 w-72 max-w-[85vw] border-r border-[#2C3D34]">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};
