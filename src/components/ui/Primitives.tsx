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
  <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{title}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-[#111111] sm:text-3xl">
          {value}
        </p>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] text-[#111111]">
        {icon}
      </div>
    </div>
    {(delta || subtitle) && (
      <div className="mt-3 flex items-center gap-2 text-xs">
        {delta && (
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              positive
                ? 'bg-emerald-50 text-[#16A34A]'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {delta}
          </span>
        )}
        {subtitle && <span className="text-neutral-500">{subtitle}</span>}
      </div>
    )}
  </div>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'gold' | 'emerald' | 'amber' | 'rose' | 'neutral';
}> = ({ children, variant = 'neutral' }) => {
  const styles: Record<string, string> = {
    gold: 'border-neutral-300 bg-[#F5F5F5] text-[#111111]',
    emerald: 'border-emerald-200 bg-emerald-50 text-[#16A34A]',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    rose: 'border-red-200 bg-red-50 text-red-700',
    neutral: 'border-[#E5E7EB] bg-[#F5F5F5] text-neutral-700',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[variant]}`}
    >
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white shadow-lg`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#E5E7EB] bg-white px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#111111]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-[#F5F5F5] hover:text-[#111111]"
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
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm leading-relaxed text-neutral-700">{message}</p>
    </div>
    <div className="mt-6 flex justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[#F5F5F5]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
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
        className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#111111] shadow-md"
      >
        {t.tone === 'success' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" />
        ) : t.tone === 'warning' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-[#111111]" />
        )}
        <span>{t.message}</span>
        <button
          type="button"
          onClick={() => onDismiss(t.id)}
          className="ml-2 text-neutral-400 hover:text-[#111111]"
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
  <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-white p-3">
    <QRCodeSVG
      value={value}
      size={size}
      bgColor="#FFFFFF"
      fgColor="#111111"
      level="H"
      includeMargin
      title={`QR code for ${value}`}
    />
  </div>
);
