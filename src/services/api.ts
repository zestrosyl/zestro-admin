import type { RestaurantSettings } from '../types';

/**
 * Stage-one adapter. It reports configuration only; it does not claim to verify
 * connectivity until a real Worker health-check endpoint is implemented.
 */
export interface StorageAdapter {
  mode: 'local-mock' | 'cloudflare-worker';
  getEndpointStatus: (settings: RestaurantSettings) => {
    configured: boolean;
    connected: boolean;
    label: string;
  };
  buildR2Key: (folder: string, filename: string) => string;
}

export const dataService: StorageAdapter = {
  mode: 'local-mock',
  getEndpointStatus(settings) {
    const configured = Boolean(settings.workerApiBaseUrl.trim());
    return {
      configured,
      connected: false,
      label: configured
        ? 'Worker URL saved · connectivity not yet verified'
        : 'Local demo mode · Cloudflare API not connected',
    };
  },
  buildR2Key(folder: string, filename: string) {
    const clean = filename.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
    return `zestro/${folder}/${Date.now()}-${clean}`;
  },
};

const CURRENCY_META: Record<string, { symbol: string }> = {
  'USD ($)': { symbol: '$' },
  'BDT (৳)': { symbol: '৳' },
  'SAR (﷼)': { symbol: 'SAR ' },
  'EUR (€)': { symbol: '€' },
  'GBP (£)': { symbol: '£' },
  'INR (₹)': { symbol: '₹' },
};

export function formatCurrency(amount: number, currency = 'USD ($)'): string {
  const meta = CURRENCY_META[currency] ?? (() => {
    const code = currency.match(/[A-Z]{3}/)?.[0] ?? 'USD';
    return { symbol: `${code} ` };
  })();
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${meta.symbol}${formatted}`;
}
