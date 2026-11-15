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
  getEndpointStatus(_settings, connected = true) {
    return {
      configured: true,
      connected,
      label: connected ? 'Connected' : 'Reconnecting',
    };
  },
  buildR2Key(folder: string, filename: string) {
    const clean = filename.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
    return `zestro/${folder}/${Date.now()}-${clean}`;
  },
};

export function normalizeCurrencyLabel(_currency?: string): string {
  return 'BDT (৳)';
}

export function formatCurrency(amount: number, _currency = 'BDT (৳)'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `৳${value.toLocaleString('en-BD', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function toDhakaDateKey(input?: string | Date): string {
  const d = input ? (input instanceof Date ? input : new Date(input)) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return y && m && day ? `${y}-${m}-${day}` : '';
}

export function formatDhakaDate(input?: string | Date): string {
  const key = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())
    ? input.trim()
    : toDhakaDateKey(input);
  if (!key) return '—';
  const [y, m, d] = key.split('-');
  return `${d}-${m}-${y}`;
}

export function formatDhakaDateTime(input?: string | Date): string {
  const d = input ? (input instanceof Date ? input : new Date(input)) : new Date();
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = formatDhakaDate(d);
  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${datePart}, ${timePart}`;
}
