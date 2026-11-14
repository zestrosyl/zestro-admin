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
import { ModuleId } from '../../types';

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

type NavGroup = NavItem['group'];

export const Sidebar: React.FC<{
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  pendingOrdersCount: number;
  incomingWaiterCallsCount: number;
  restaurantName: string;
}> = ({
  activeModule,
  onSelectModule,
  mobileOpen,
  onCloseMobile,
  pendingOrdersCount,
  incomingWaiterCallsCount,
  restaurantName,
}) => {
  const groups: NavGroup[] = ['Operations', 'Menu & Media', 'Growth & Team'];

  /**
   * `drawer` is the full mobile panel. `responsive` is the desktop column: an icon
   * rail on tablet widths that expands to the full sidebar from the xl breakpoint.
   */
  const renderContent = (mode: 'drawer' | 'responsive') => {
    const full = mode === 'drawer';
    const showLabel = full ? '' : 'hidden xl:inline';
    const showBlock = full ? '' : 'hidden xl:block';
    return (
      <div className="flex h-full flex-col bg-surface text-ink">
        <div className={`flex items-center justify-between border-b border-line py-4 ${full ? 'px-5' : 'justify-center px-3 xl:justify-between xl:px-5'}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-card">
              <Sparkles className="h-[18px] w-[18px]" />
            </div>
            <div className={`min-w-0 ${showBlock}`}>
              <p className="truncate font-serif text-[15px] font-bold leading-tight tracking-wider text-ink">
                {restaurantName} <span className="text-accent">ADMIN</span>
              </p>
              <p className="text-[11px] leading-tight text-ink-3">Restaurant Operations</p>
            </div>
          </div>
          {full && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          {groups.map((group, gi) => (
            <div key={group} className={gi > 0 ? 'mt-5' : ''}>
              <p className={`mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3 ${showBlock}`}>
                {group}
              </p>
              {!full && gi > 0 && <div className="mx-2 mb-3 border-t border-line xl:hidden" />}
              <div className="space-y-0.5">
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
                      title={item.label}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        onSelectModule(item.id);
                        onCloseMobile();
                      }}
                      className={`group relative flex w-full items-center rounded-lg py-2 text-sm transition-colors ${
                        full ? 'justify-between px-3' : 'justify-center px-0 xl:justify-between xl:px-3'
                      } ${
                        active
                          ? 'bg-primary-soft font-semibold text-primary-ink'
                          : 'font-medium text-ink-2 hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
                      <span className="flex items-center gap-3">
                        <span className={`transition-transform duration-150 ${active ? '' : 'group-hover:translate-x-0.5'}`}>
                          {item.icon}
                        </span>
                        <span className={showLabel}>{item.label}</span>
                      </span>
                      {badgeCount > 0 && (
                        <>
                          <span className={`rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold text-on-primary ${showLabel}`}>
                            {badgeCount}
                          </span>
                          {!full && (
                            <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface xl:hidden" aria-hidden="true" />
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={`border-t border-line p-3 ${full ? '' : 'hidden xl:block'}`}>
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">Demo workspace</span>
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">
              Changes save in this browser. Cloud backend not connected.
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 border-r border-line md:block xl:w-64">
        {renderContent('responsive')}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="modal-backdrop fixed inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onCloseMobile} />
          <aside className="relative z-50 w-72 max-w-[85vw] border-r border-line shadow-pop">
            {renderContent('drawer')}
          </aside>
        </div>
      )}
    </>
  );
};
