import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary shadow-card hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-on-danger shadow-card hover:brightness-110',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading = false, icon, disabled, className = '', children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

/** Icon-only button. A label is required so it stays accessible. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: 'secondary' | 'ghost' }
>(({ label, variant = 'ghost', className = '', type = 'button', children, ...rest }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label={label}
    title={label}
    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
      variant === 'secondary'
        ? 'border border-line-strong bg-surface text-ink hover:bg-surface-2'
        : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
    } ${className}`}
    {...rest}
  >
    {children}
  </button>
));
IconButton.displayName = 'IconButton';
