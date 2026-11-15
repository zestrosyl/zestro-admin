import React, { useEffect, useRef, useState } from 'react';
import { Save, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { RestaurantSettings } from '../types';
import { normalizeCurrencyLabel } from '../services/api';
import { ADMIN_API_BASE, uploadMediaToR2 } from '../services/liveApi';

const ALLOWED_LOGO_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/avif',
  'image/svg+xml',
]);

function resolveAdminLogoPreview(url?: string): string {
  if (!url) return '';
  if (url.startsWith('/api/media')) return `${ADMIN_API_BASE}${url}`;
  return url;
}

export const SettingsModule: React.FC<{
  settings: RestaurantSettings;
  connected?: boolean;
  canManage?: boolean;
  onSaveSettings: (next: RestaurantSettings) => Promise<boolean> | void;
}> = ({ settings, canManage = true, onSaveSettings }) => {
  const [draft, setDraft] = useState<RestaurantSettings>({
    ...settings,
    currency: normalizeCurrencyLabel(settings.currency),
  });
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft({
      ...settings,
      currency: normalizeCurrencyLabel(settings.currency),
    });
  }, [settings]);

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canManage) return;

    setLogoError(null);
    setLogoMessage(null);

    const isSvg =
      file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    if (!isSvg && !ALLOWED_LOGO_TYPES.has(file.type)) {
      setLogoError('Please upload a PNG, JPG, JPEG, WebP, or SVG logo.');
      return;
    }
    const maxBytes = isSvg ? 512 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setLogoError(isSvg ? 'SVG logo must be 512 KB or smaller.' : 'Logo image must be 5 MB or smaller.');
      return;
    }

    setLogoUploading(true);
    try {
      const asset = await uploadMediaToR2(file, 'branding', `${draft.restaurantName || 'Restaurant'} Logo`);
      const next: RestaurantSettings = {
        ...draft,
        logoKey: asset.r2Key || '',
        logoUrl: asset.url,
      };
      setDraft(next);
      const saved = await onSaveSettings(next);
      if (saved !== false) {
        setLogoMessage('Logo updated and saved.');
      }
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Logo upload failed.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!canManage || logoUploading) return;
    setLogoError(null);
    setLogoMessage(null);
    setLogoUploading(true);
    try {
      const next: RestaurantSettings = { ...draft, logoKey: '', logoUrl: '' };
      setDraft(next);
      const saved = await onSaveSettings(next);
      if (saved !== false) {
        setLogoMessage('Logo removed.');
      }
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Could not remove logo.');
    } finally {
      setLogoUploading(false);
    }
  };

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
          Configure restaurant profile, branding, taxes, delivery rules, and ordering channels.
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-[#F3EBDD]">
                <ImageIcon className="h-5 w-5 text-[#D7A65A]" /> Restaurant Branding
              </h2>
              <p className="mt-1 text-xs text-[#F3EBDD]/65">
                Upload your restaurant logo to display in the customer website header.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-24 w-48 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#2C3D34] bg-[#101B17] p-3">
              {draft.logoUrl ? (
                <img
                  src={resolveAdminLogoPreview(draft.logoUrl)}
                  alt={`${draft.restaurantName || 'Restaurant'} logo`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-center text-[#F3EBDD]/45">
                  <ImageIcon className="h-5 w-5" />
                  <span className="text-[11px]">No custom logo</span>
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-2.5">
              <input
                ref={logoInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.avif,.svg,image/png,image/jpeg,image/webp,image/avif,image/svg+xml"
                className="hidden"
                onChange={handleLogoFileChange}
              />
              <div className="flex flex-wrap items-center gap-2">
                {canManage && (
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#D7A65A]/45 bg-[#D7A65A]/15 px-3.5 py-2 text-xs font-semibold text-[#D7A65A] transition hover:bg-[#D7A65A]/25 disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {logoUploading
                      ? 'Uploading...'
                      : draft.logoUrl
                      ? 'Replace Logo'
                      : 'Upload Logo'}
                  </button>
                )}
                {canManage && draft.logoUrl && (
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#F3EBDD]/55">
                Supports PNG, JPG, JPEG, WebP, or SVG. Recommended transparent background (max 5 MB; 512 KB for SVG).
              </p>
              {logoError && (
                <p className="text-xs font-medium text-rose-300">{logoError}</p>
              )}
              {logoMessage && (
                <p className="text-xs font-medium text-emerald-300">{logoMessage}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
