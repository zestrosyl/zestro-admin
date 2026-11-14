import React, { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { ToastMessage } from '../../types';

export const StatCard: React.FC<{
  title: string;
  value: string;
  delta?: string;
  positive?: boolean;
  icon: React.ReactNode;
  subtitle?: string;
}> = ({ title, value, delta, positive = true, icon, subtitle }) => (
  <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-5 transition-all duration-200 hover:border-[#D7A65A]/45">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#F3EBDD]/60">{title}</p>
        <p className="mt-2 font-serif text-2xl font-semibold text-[#F3EBDD] sm:text-3xl">{value}</p>
      </div>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D7A65A]/25 bg-[#101B17] text-[#D7A65A]">
        {icon}
      </div>
    </div>
    {(delta || subtitle) && (
      <div className="mt-3 flex items-center gap-2 text-xs">
        {delta && (
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              positive
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {delta}
          </span>
        )}
        {subtitle && <span className="text-[#F3EBDD]/55">{subtitle}</span>}
      </div>
    )}
  </div>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'gold' | 'emerald' | 'amber' | 'rose' | 'neutral';
}> = ({ children, variant = 'neutral' }) => {
  const styles: Record<string, string> = {
    gold: 'border-[#D7A65A]/40 bg-[#D7A65A]/15 text-[#D7A65A]',
    emerald: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
    amber: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
    rose: 'border-rose-500/35 bg-rose-500/15 text-rose-300',
    neutral: 'border-[#2C3D34] bg-[#101B17] text-[#F3EBDD]/75',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[variant]}`}>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm modal-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-2xl border border-[#2C3D34] bg-[#1D2922] shadow-2xl`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#2C3D34] bg-[#1D2922] px-6 py-4">
          <div>
            <h3 className="font-serif text-lg font-semibold text-[#F3EBDD]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-[#F3EBDD]/60">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#F3EBDD]/60 transition hover:bg-[#101B17] hover:text-[#F3EBDD]"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
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
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm leading-relaxed text-[#F3EBDD]/80">{message}</p>
    </div>
    <div className="mt-6 flex justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-2 text-sm font-medium text-[#F3EBDD]/80 transition hover:border-[#F3EBDD]/30"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
      >
        {confirmLabel}
      </button>
    </div>
  </Modal>
);

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => (
  <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
    {toasts.map((t) => (
      <div
        key={t.id}
        className="toast-enter flex items-center gap-3 rounded-xl border border-[#D7A65A]/40 bg-[#1D2922] px-4 py-3 text-sm text-[#F3EBDD] shadow-xl"
      >
        {t.tone === 'success' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : t.tone === 'warning' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-[#D7A65A]" />
        )}
        <span>{t.message}</span>
        <button
          type="button"
          onClick={() => onDismiss(t.id)}
          className="ml-2 text-[#F3EBDD]/50 hover:text-[#F3EBDD]"
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
