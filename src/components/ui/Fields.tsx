import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';

const CONTROL =
  'w-full rounded-xl border bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3';
const OK = 'border-line-strong hover:border-ink-3/60 focus:border-primary focus:ring-primary/20';
const BAD = 'border-danger focus:border-danger focus:ring-danger/20';

/** Label, hint and error wrapper shared by every form control. */
export const Field: React.FC<{
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}> = ({ label, hint, error, htmlFor, children }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
      {label}
    </label>
    {children}
    {error ? (
      <p className="mt-1.5 flex items-center gap-1 text-xs text-danger-ink" role="alert">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
      </p>
    ) : (
      hint && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>
    )}
  </div>
);

type WithField = { label: string; hint?: string; error?: string };

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & WithField>(
  ({ label, hint, error, className = '', id, ...rest }, ref) => {
    const auto = useId();
    const inputId = id ?? auto;
    return (
      <Field label={label} hint={hint} error={error} htmlFor={inputId}>
        <input ref={ref} id={inputId} aria-invalid={Boolean(error) || undefined} className={`h-10 ${CONTROL} ${error ? BAD : OK} ${className}`} {...rest} />
      </Field>
    );
  }
);
Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & WithField>(
  ({ label, hint, error, className = '', id, children, ...rest }, ref) => {
    const auto = useId();
    const selectId = id ?? auto;
    return (
      <Field label={label} hint={hint} error={error} htmlFor={selectId}>
        <select ref={ref} id={selectId} aria-invalid={Boolean(error) || undefined} className={`h-10 ${CONTROL} ${error ? BAD : OK} ${className}`} {...rest}>
          {children}
        </select>
      </Field>
    );
  }
);
Select.displayName = 'Select';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & WithField>(
  ({ label, hint, error, className = '', id, rows = 3, ...rest }, ref) => {
    const auto = useId();
    const areaId = id ?? auto;
    return (
      <Field label={label} hint={hint} error={error} htmlFor={areaId}>
        <textarea ref={ref} id={areaId} rows={rows} aria-invalid={Boolean(error) || undefined} className={`py-2.5 ${CONTROL} ${error ? BAD : OK} ${className}`} {...rest} />
      </Field>
    );
  }
);
Textarea.displayName = 'Textarea';

export const Switch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, description, disabled }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <p className="text-sm font-medium text-ink">{label}</p>
      {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-55 ${
        checked ? 'bg-primary' : 'bg-line-strong'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);
