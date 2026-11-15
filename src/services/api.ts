import type { RestaurantSettings } from '../types';

export interface StorageAdapter {
  mode: 'cloudflare-worker';
  getEndpointStatus: (settings: RestaurantSettings, connected?: boolean) => {
    configured: boolean;
    connected: boolean;
    label: string;
  };
  buildR2Key: (folder: string, filename: string) => string;
}

export const dataService: StorageAdapter = {
  mode: 'cloudflare-worker',
  getEndpointStatus(settings, connected = true) {
    const configured = Boolean(settings.workerApiBaseUrl.trim());
    return {
      configured,
      connected,
      label: connected
        ? 'Live Cloudflare Worker · D1 & R2 persistent storage active'
        : configured
        ? 'Cloudflare Worker configured · awaiting connection'
        : 'Cloudflare Worker endpoint not configured',
    };
  },
  buildR2Key(folder: string, filename: string) {
    const clean = filename.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
    return `zestro/${folder}/${Date.now()}-${clean}`;
  },
};

const CURRENCY_META: Record<string, { symbol: string; label: string; code: string }> = {
  USD: { symbol: '$', label: 'USD ($)', code: 'USD' },
  'USD ($)': { symbol: '$', label: 'USD ($)', code: 'USD' },
  BDT: { symbol: '৳', label: 'BDT (৳)', code: 'BDT' },
  'BDT (৳)': { symbol: '৳', label: 'BDT (৳)', code: 'BDT' },
  SAR: { symbol: 'SAR ', label: 'SAR (﷼)', code: 'SAR' },
  'SAR (﷼)': { symbol: 'SAR ', label: 'SAR (﷼)', code: 'SAR' },
  EUR: { symbol: '€', label: 'EUR (€)', code: 'EUR' },
  'EUR (€)': { symbol: '€', label: 'EUR (€)', code: 'EUR' },
  GBP: { symbol: '£', label: 'GBP (£)', code: 'GBP' },
  'GBP (£)': { symbol: '£', label: 'GBP (£)', code: 'GBP' },
  INR: { symbol: '₹', label: 'INR (₹)', code: 'INR' },
  'INR (₹)': { symbol: '₹', label: 'INR (₹)', code: 'INR' },
};

export function normalizeCurrencyLabel(currency?: string): string {
  if (!currency) return 'BDT (৳)';
  return CURRENCY_META[currency]?.label ?? currency;
}

export function formatCurrency(amount: number, currency = 'BDT (৳)'): string {
  const meta =
    CURRENCY_META[currency] ??
    (() => {
      const code = currency.match(/[A-Z]{3}/)?.[0] ?? 'BDT';
      return CURRENCY_META[code] ?? { symbol: `${code} `, label: code, code };
    })();
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${meta.symbol}${formatted}`;
}
