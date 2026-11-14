import React from 'react';
import { Menu, BellRing, Plus, Search } from 'lucide-react';
import { ModuleId } from '../../types';
import { NAV_ITEMS } from './Sidebar';

export const Header: React.FC<{
  activeModule: ModuleId;
  onOpenMobileMenu: () => void;
  incomingWaiterCallsCount: number;
  onJumpToWaiterCalls: () => void;
  onQuickAddMenu: () => void;
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
}> = ({
  activeModule,
  onOpenMobileMenu,
  incomingWaiterCallsCount,
  onJumpToWaiterCalls,
  onQuickAddMenu,
  globalSearch,
  onGlobalSearchChange,
}) => {
  const current = NAV_ITEMS.find((i) => i.id === activeModule);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[#2C3D34] bg-[#101B17]/95 px-4 py-3.5 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-xl border border-[#2C3D34] bg-[#1D2922] p-2 text-[#F3EBDD] lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-serif text-lg font-semibold text-[#F3EBDD] sm:text-xl">
            {current?.label ?? 'Overview'}
          </h1>
          <p className="hidden text-xs text-[#F3EBDD]/55 sm:block">
            Restaurant operations · Menu · Guest experience
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F3EBDD]/45" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            placeholder="Search orders & menu..."
            className="w-48 rounded-xl border border-[#2C3D34] bg-[#1D2922] py-2 pl-9 pr-3 text-xs text-[#F3EBDD] placeholder-[#F3EBDD]/40 focus:border-[#D7A65A] focus:outline-none lg:w-64"
          />
        </div>

        <button
          type="button"
          onClick={onJumpToWaiterCalls}
          className="relative flex items-center gap-2 rounded-xl border border-[#2C3D34] bg-[#1D2922] px-3 py-2 text-xs font-medium text-[#F3EBDD] transition hover:border-[#D7A65A]/50"
        >
          <BellRing className={`h-4 w-4 ${incomingWaiterCallsCount > 0 ? 'text-[#D7A65A]' : 'text-[#F3EBDD]/60'}`} />
          <span className="hidden sm:inline">Waiter Calls</span>
          {incomingWaiterCallsCount > 0 && (
            <span className="rounded-full bg-[#D7A65A] px-1.5 py-0.5 text-[10px] font-bold text-[#101B17]">
              {incomingWaiterCallsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onQuickAddMenu}
          className="flex items-center gap-1.5 rounded-xl bg-[#D7A65A] px-3.5 py-2 text-xs font-semibold text-[#101B17] transition hover:bg-[#e3b772]"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Dish</span>
        </button>
      </div>
    </header>
  );
};
