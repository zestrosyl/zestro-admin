/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy brand colors, still referenced by modules that have not been redesigned yet.
        midnight: '#101B17',
        charcoal: '#1D2922',
        gold: '#D7A65A',
        ivory: '#F3EBDD',

        // Design tokens. Values come from CSS variables in src/index.css so that
        // light and dark themes share one set of class names.
        canvas: token('canvas'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        'ink-3': token('ink-3'),
        primary: token('primary'),
        'primary-hover': token('primary-hover'),
        'on-primary': token('on-primary'),
        'primary-soft': token('primary-soft'),
        'primary-ink': token('primary-ink'),
        accent: token('accent'),
        'accent-soft': token('accent-soft'),
        'accent-ink': token('accent-ink'),
        success: token('success'),
        'success-soft': token('success-soft'),
        'success-ink': token('success-ink'),
        warning: token('warning'),
        'warning-soft': token('warning-soft'),
        'warning-ink': token('warning-ink'),
        danger: token('danger'),
        'on-danger': token('on-danger'),
        'danger-soft': token('danger-soft'),
        'danger-ink': token('danger-ink'),
        info: token('info'),
        'info-soft': token('info-soft'),
        'info-ink': token('info-ink'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Reserved for the ZESTRO wordmark and modules that have not been redesigned yet.
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.05), 0 1px 3px rgb(var(--shadow) / 0.04)',
        raised: '0 4px 12px rgb(var(--shadow) / 0.08), 0 1px 3px rgb(var(--shadow) / 0.05)',
        pop: '0 12px 32px rgb(var(--shadow) / 0.16), 0 2px 6px rgb(var(--shadow) / 0.08)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
    },
  },
  plugins: [],
};
