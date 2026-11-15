import React from 'react';
import { Menu, BellRing, Plus, Search, RefreshCw, LogOut } from 'lucide-react';
import { ModuleId } from '../../types';
import { NAV_ITEMS } from './Sidebar';

export const Header: React.FC<{
  activeModule: ModuleId;
  onOpenMobileMenu: () => void;
  incomingWaiterCallsCount: number;
  onJumpToWaiterCalls: () => void;
  onQuickAddMenu: () => void;
  canManageCatalog?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
}> = ({
  activeModule,
  onOpenMobileMenu,
  incomingWaiterCallsCount,
  onJumpToWaiterCalls,
  onQuickAddMenu,
  canManageCatalog = true,
  onRefresh,
  refreshing = false,
  globalSearch,
  onGlobalSearchChange,
}) => {
  const current = NAV_ITEMS.find((i) => i.id === activeModule);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[#E5E7EB] bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg border border-[#E5E7EB] bg-white p-2 text-[#111111] hover:bg-[#F5F5F5] lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-[#111111] sm:text-xl">
            {current?.label ?? 'Dashboard'}
          </h1>
          <p className="hidden text-xs text-neutral-500 sm:block">
            Restaurant operations &amp; live orders
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            placeholder="Search orders & menu..."
            className="w-48 rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] py-1.5 pl-9 pr-3 text-xs text-[#111111] placeholder-neutral-400 focus:border-[#111111] focus:bg-white focus:outline-none lg:w-64"
          />
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh live data"
            className="flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#F5F5F5] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-neutral-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline">Refresh</span>
          </button>
        )}

        <button
          type="button"
          onClick={onJumpToWaiterCalls}
          className="relative flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#F5F5F5]"
        >
          <BellRing
            className={`h-4 w-4 ${incomingWaiterCallsCount > 0 ? 'text-[#16A34A]' : 'text-neutral-500'}`}
          />
          <span className="hidden sm:inline">Waiter Calls</span>
          {incomingWaiterCallsCount > 0 && (
            <span className="rounded-full bg-[#16A34A] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {incomingWaiterCallsCount}
            </span>
          )}
        </button>

        {canManageCatalog && (
          <button
            type="button"
            onClick={onQuickAddMenu}
            className="flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Dish</span>
          </button>
        )}

        <a
          href="/cdn-cgi/access/logout"
          title="Log out"
          aria-label="Log out"
          className="hidden items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-[#F5F5F5] hover:text-[#111111] sm:inline-flex"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Log out</span>
        </a>
      </div>
    </header>
  );
};
