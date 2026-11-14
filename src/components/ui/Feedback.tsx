import React from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button } from './Button';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />
);

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}> = ({ title, description, icon, actionLabel, onAction, compact = false }) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-8' : 'px-6 py-14'}`}>
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-ink-3">
      {icon ?? <Inbox className="h-5 w-5" />}
    </div>
    <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
    {description && <p className="mt-1 max-w-xs text-sm text-ink-3">{description}</p>}
    {actionLabel && onAction && (
      <Button className="mt-4" size="sm" variant="secondary" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  description?: string;
  onRetry?: () => void;
}> = ({ title = 'Something went wrong', description, onRetry }) => (
  <div role="alert" className="flex flex-col items-center justify-center px-6 py-12 text-center">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger-ink">
      <AlertTriangle className="h-5 w-5" />
    </div>
    <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
    {onRetry && (
      <Button className="mt-4" size="sm" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

/** Inline notice for page-level context such as demo-data warnings. */
export const Notice: React.FC<{
  tone?: 'info' | 'warning';
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ tone = 'warning', children, action }) => (
  <div
    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
      tone === 'warning'
        ? 'border-warning/25 bg-warning-soft text-warning-ink'
        : 'border-info/25 bg-info-soft text-info-ink'
    }`}
  >
    <p className="min-w-0 flex-1">{children}</p>
    {action}
  </div>
);
