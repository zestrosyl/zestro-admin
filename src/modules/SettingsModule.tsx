import React, { useEffect, useState } from 'react';
import { Save, Cloud } from 'lucide-react';
import { RestaurantSettings } from '../types';
import { dataService, normalizeCurrencyLabel } from '../services/api';
import { Badge } from '../components/ui/Primitives';

export const SettingsModule: React.FC<{
  settings: RestaurantSettings;
  connected?: boolean;
  canManage?: boolean;
  onSaveSettings: (next: RestaurantSettings) => Promise<boolean> | void;
}> = ({ settings, connected = true, canManage = true, onSaveSettings }) => {
  const [draft, setDraft] = useState<RestaurantSettings>({
    ...settings,
    currency: normalizeCurrencyLabel(settings.currency),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      ...settings,
      currency: normalizeCurrencyLabel(settings.currency),
    });
  }, [settings]);

  const endpointStatus = dataService.getEndpointStatus(draft, connected);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || saving) return;
    setSaving(true);
    try {
      await onSaveSettings(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#F3EBDD]/70">
          Configure restaurant profile, taxes, delivery rules, ordering channels, and Cloudflare bindings.
        </p>
        {canManage && (
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-5 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772] disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
          <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Restaurant Identity &amp; Pricing</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Name</label>
              <input
                type="text"
                disabled={!canManage}
                value={draft.restaurantName}
                onChange={(e) => setDraft({ ...draft, restaurantName: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Tagline</label>
              <input
                type="text"
                disabled={!canManage}
                value={draft.tagline}
                onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Currency</label>
              <select
                disabled={!canManage}
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              >
                <option value="BDT (৳)">BDT (৳)</option>
                <option value="USD ($)">USD ($)</option>
                <option value="SAR (﷼)">SAR (﷼)</option>
                <option value="EUR (€)">EUR (€)</option>
                <option value="GBP (£)">GBP (£)</option>
                <option value="INR (₹)">INR (₹)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Tax (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                disabled={!canManage}
                value={draft.taxRatePercent}
                onChange={(e) => setDraft({ ...draft, taxRatePercent: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Service (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                disabled={!canManage}
                value={draft.serviceChargePercent}
                onChange={(e) => setDraft({ ...draft, serviceChargePercent: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Delivery Fee</label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canManage}
                value={draft.deliveryFee}
                onChange={(e) => setDraft({ ...draft, deliveryFee: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Minimum Order</label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canManage}
                value={draft.minOrderAmount}
                onChange={(e) => setDraft({ ...draft, minOrderAmount: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
          <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Contact &amp; Hours</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Phone</label>
              <input
                type="text"
                disabled={!canManage}
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">WhatsApp Order Number</label>
              <input
                type="text"
                disabled={!canManage}
                value={draft.whatsappNumber}
                onChange={(e) => setDraft({ ...draft, whatsappNumber: e.target.value })}
                placeholder="88017..."
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Email</label>
            <input
              type="email"
              disabled={!canManage}
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Street Address</label>
            <input
              type="text"
              disabled={!canManage}
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Opening Hours</label>
            <input
              type="text"
              disabled={!canManage}
              value={draft.openingHours}
              onChange={(e) => setDraft({ ...draft, openingHours: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
          <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Website &amp; Ordering</h2>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Customer Website URL</label>
            <input
              type="url"
              disabled={!canManage}
              value={draft.websiteUrl}
              onChange={(e) => setDraft({ ...draft, websiteUrl: e.target.value })}
              placeholder="https://zestro-customer-website.pages.dev"
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
            <p className="mt-1 text-[11px] text-[#F3EBDD]/45">
              Used to generate scannable table QR menu links (`?table=T-01`).
            </p>
          </div>
          {[
            { key: 'onlineOrderingEnabled', label: 'Enable Online Takeaway & Delivery Orders' },
            { key: 'qrTableOrderingEnabled', label: 'Enable Table QR Code Self-Ordering' },
            { key: 'autoAcceptOrders', label: 'Auto-Accept Incoming Kitchen Orders' },
            { key: 'waiterCallSoundEnabled', label: 'Audible Alert on New Waiter Call' },
          ].map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-center justify-between rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-3 text-sm text-[#F3EBDD]"
            >
              <span>{item.label}</span>
              <input
                type="checkbox"
                disabled={!canManage}
                checked={Boolean(draft[item.key as keyof RestaurantSettings])}
                onChange={(e) => setDraft({ ...draft, [item.key]: e.target.checked })}
                className="h-4 w-4 accent-[#D7A65A]"
              />
            </label>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-[#F3EBDD]">
              <Cloud className="h-5 w-5 text-[#D7A65A]" /> Cloudflare Backend Status
            </h2>
            <Badge variant={endpointStatus.connected ? 'emerald' : 'amber'}>
              {endpointStatus.connected ? 'Connected · D1 + R2' : 'Disconnected'}
            </Badge>
          </div>
          <p className="text-xs text-[#F3EBDD]/65">
            All modules — menu, categories, orders, tables, waiter calls, promotions, staff memberships,
            homepage configuration, gallery photography, R2 media uploads, and restaurant settings — persist
            directly to Cloudflare D1 and R2 behind Cloudflare Access authentication.
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">
              Cloudflare Worker API Base URL
            </label>
            <input
              type="url"
              disabled={!canManage}
              value={draft.workerApiBaseUrl}
              onChange={(e) => setDraft({ ...draft, workerApiBaseUrl: e.target.value })}
              placeholder="https://zestro-admin-api.zestro-syl.workers.dev"
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">
              R2 Media Delivery Endpoint
            </label>
            <input
              type="text"
              disabled={!canManage}
              value={draft.r2PublicBucketUrl}
              onChange={(e) => setDraft({ ...draft, r2PublicBucketUrl: e.target.value })}
              placeholder="https://zestro-customer-api.zestro-syl.workers.dev/api/media"
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
        </div>
      </div>
    </form>
  );
};
