import React, { useEffect, useRef, useState } from 'react';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

/** Small accessible action menu: Escape and outside click close it, arrow keys move focus. */
export const Dropdown: React.FC<{
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
}> = ({ trigger, items, align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const nodes = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const idx = nodes.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % nodes.length : (idx - 1 + nodes.length) % nodes.length;
        nodes[next]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={`popover-enter absolute z-40 mt-2 min-w-[11rem] rounded-xl border border-line bg-surface p-1.5 shadow-pop ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${
                item.tone === 'danger' ? 'text-danger-ink' : 'text-ink'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
