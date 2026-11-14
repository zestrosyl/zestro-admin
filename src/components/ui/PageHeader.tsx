import React from 'react';

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

/** Standard card surface for sections, tables and charts. */
export const Card: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, description, actions, className = '', bodyClassName = 'p-5', children }) => (
  <section className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>
    {(title || actions) && (
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
          {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
        </div>
        {actions}
      </header>
    )}
    <div className={bodyClassName}>{children}</div>
  </section>
);
