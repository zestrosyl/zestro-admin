import React from 'react';
import { Menu, BellRing, Plus, Search, Sun, Moon } from 'lucide-react';
import { ModuleId } from '../../types';
import { NAV_ITEMS } from './Sidebar';
import { Button, IconButton } from '../ui/Button';
import type { Theme } from '../../hooks/useTheme';

export const Header: React.FC<{
  activeModule: ModuleId;
  onOpenMobileMenu: () => void;
  incomingWaiterCallsCount: number;
  onJumpToWaiterCalls: () => void;
  onQuickAddMenu: () => void;
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
}> = ({
  activeModule,
  onOpenMobileMenu,
  incomingWaiterCallsCount,
  onJumpToWaiterCalls,
  onQuickAddMenu,
  globalSearch,
  onGlobalSearchChange,
  theme,
  onToggleTheme,
}) => {
  const current = NAV_ITEMS.find((i) => i.id === activeModule);

  const searchInput = (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        value={globalSearch}
        onChange={(e) => onGlobalSearchChange(e.target.value)}
        placeholder="Search orders & menu"
        aria-label="Search orders and menu"
        className="h-10 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 transition hover:border-ink-3/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton label="Open navigation" variant="secondary" onClick={onOpenMobileMenu} className="md:hidden">
            <Menu className="h-5 w-5" />
          </IconButton>
          <div className="min-w-0">
            <p className="hidden truncate text-xs text-ink-3 sm:block">
              ZESTRO Admin <span aria-hidden="true">/</span> {current?.group}
            </p>
            <h1 className="truncate text-lg font-semibold leading-tight tracking-tight text-ink sm:text-xl">
              {current?.label ?? 'Overview'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden w-56 md:block lg:w-72">{searchInput}</div>

          <Button
            variant="secondary"
            onClick={onJumpToWaiterCalls}
            aria-label={`Waiter calls${incomingWaiterCallsCount ? `, ${incomingWaiterCallsCount} incoming` : ''}`}
            className="relative"
          >
            <BellRing className={`h-4 w-4 ${incomingWaiterCallsCount > 0 ? 'text-accent' : 'text-ink-3'}`} />
            <span className="hidden lg:inline">Waiter calls</span>
            {incomingWaiterCallsCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold text-on-primary">
                {incomingWaiterCallsCount}
              </span>
            )}
          </Button>

          <IconButton
            label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            variant="secondary"
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </IconButton>

          <Button variant="primary" onClick={onQuickAddMenu} icon={<Plus className="h-4 w-4" />} aria-label="Add dish">
            <span className="hidden sm:inline">Add dish</span>
          </Button>
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden">{searchInput}</div>
    </header>
  );
};
