import React, { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { ToastMessage } from '../../types';
import { Button } from './Button';

export const StatCard: React.FC<{
  title: string;
  value: string;
  delta?: string;
  positive?: boolean;
  icon: React.ReactNode;
  subtitle?: string;
}> = ({ title, value, delta, positive = true, icon, subtitle }) => (
  <div className="group rounded-2xl border border-line bg-surface p-5 shadow-card transition duration-200 hover:border-line-strong hover:shadow-raised">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-2">{title}</p>
        <p className="tabular mt-2 truncate text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{value}</p>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink transition duration-200 group-hover:scale-105">
        {icon}
      </div>
    </div>
    {(delta || subtitle) && (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta && (
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              positive ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink'
            }`}
          >
            {delta}
          </span>
        )}
        {subtitle && <span className="text-ink-3">{subtitle}</span>}
      </div>
    )}
  </div>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'gold' | 'emerald' | 'amber' | 'rose' | 'info' | 'neutral';
}> = ({ children, variant = 'neutral' }) => {
  const styles: Record<string, string> = {
    gold: 'bg-accent-soft text-accent-ink ring-accent/25',
    emerald: 'bg-success-soft text-success-ink ring-success/25',
    amber: 'bg-warning-soft text-warning-ink ring-warning/25',
    rose: 'bg-danger-soft text-danger-ink ring-danger/25',
    info: 'bg-info-soft text-info-ink ring-info/25',
    neutral: 'bg-surface-2 text-ink-2 ring-line-strong/60',
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[variant]}`}>
      {children}
    </span>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidth = 'max-w-xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel w-full ${maxWidth} max-h-[92vh] overflow-y-auto rounded-t-2xl border border-line bg-surface text-ink shadow-pop sm:max-h-[90vh] sm:rounded-2xl`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 rounded-lg p-1.5 text-ink-3 transition hover:bg-surface-2 hover:text-ink"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }) => (
  <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger-ink">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="pt-1.5 text-sm leading-relaxed text-ink-2">{message}</p>
    </div>
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button variant="danger" onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => (
  <div
    className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
    aria-live="polite"
  >
    {toasts.map((t) => (
      <div
        key={t.id}
        role="status"
        className="toast-enter pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-pop sm:min-w-[18rem] sm:max-w-sm"
      >
        {t.tone === 'success' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : t.tone === 'warning' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-info" />
        )}
        <span className="min-w-0 flex-1">{t.message}</span>
        <button
          type="button"
          onClick={() => onDismiss(t.id)}
          className="rounded-md p-0.5 text-ink-3 transition hover:bg-surface-2 hover:text-ink"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ))}
  </div>
);

/** Standards-compliant QR code. The encoded URL must resolve to the restaurant's public menu. */
export const QrCodeSvg: React.FC<{ value: string; size?: number }> = ({ value, size = 148 }) => (
  <div className="inline-flex rounded-2xl bg-[#F3EBDD] p-3 shadow-inner">
    <QRCodeSVG
      value={value}
      size={size}
      bgColor="#F3EBDD"
      fgColor="#101B17"
      level="H"
      includeMargin
      title={`QR code for ${value}`}
    />
  </div>
);
