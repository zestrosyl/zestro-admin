import React, { useState } from 'react';
import { Save, Cloud } from 'lucide-react';
import { RestaurantSettings } from '../types';
import { dataService } from '../services/api';
import { Badge } from '../components/ui/Primitives';

export const SettingsModule: React.FC<{
  settings: RestaurantSettings;
  onSaveSettings: (next: RestaurantSettings) => void;
}> = ({ settings, onSaveSettings }) => {
  const [draft, setDraft] = useState<RestaurantSettings>(settings);
  const endpointStatus = dataService.getEndpointStatus(draft);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#F3EBDD]/70">
          Configure restaurant profile, taxes, ordering channels, and Cloudflare backend bindings.
        </p>
        <button
          type="submit"
          className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-5 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
        >
          <Save className="h-4 w-4" /> Save Settings
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6 space-y-4">
          <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Restaurant Identity</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Name</label>
              <input
                type="text"
                value={draft.restaurantName}
                onChange={(e) => setDraft({ ...draft, restaurantName: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Tagline</label>
              <input
                type="text"
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
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              >
                <option>USD ($)</option>
                <option>BDT (৳)</option>
                <option>SAR (﷼)</option>
                <option>EUR (€)</option>
                <option>GBP (£)</option>
                <option>INR (₹)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Tax (%)</label>
              <input
                type="number"
                step="0.1"
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
                value={draft.serviceChargePercent}
                onChange={(e) => setDraft({ ...draft, serviceChargePercent: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6 space-y-4">
          <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Contact &amp; Hours</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Phone</label>
              <input
                type="text"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Email</label>
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Street Address</label>
            <input
              type="text"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Opening Hours</label>
            <input
              type="text"
              value={draft.openingHours}
              onChange={(e) => setDraft({ ...draft, openingHours: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6 space-y-4">
          <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Website &amp; Ordering</h2>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Customer Website URL</label>
            <input
              type="url"
              value={draft.websiteUrl}
              onChange={(e) => setDraft({ ...draft, websiteUrl: e.target.value })}
              placeholder="https://your-customer-website.com"
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
            <p className="mt-1 text-[11px] text-[#F3EBDD]/45">Used to create table QR menu links. Confirm the public menu route before printing codes.</p>
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
                checked={Boolean(draft[item.key as keyof RestaurantSettings])}
                onChange={(e) => setDraft({ ...draft, [item.key]: e.target.checked })}
                className="h-4 w-4 accent-[#D7A65A]"
              />
            </label>
          ))}
        </div>

        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-[#F3EBDD]">
              <Cloud className="h-5 w-5 text-[#D7A65A]" /> Cloudflare API Configuration
            </h2>
            <Badge variant={endpointStatus.configured ? 'gold' : 'neutral'}>
              {endpointStatus.configured ? 'URL configured' : 'Demo mode'}
            </Badge>
          </div>
          <p className="text-xs text-[#F3EBDD]/65">
            This build currently runs in local demo mode. Saving a Worker URL does not connect the database or verify the service. The production API, D1 schema, R2 upload flow and server-side authentication still need to be deployed. Keep all private keys in Cloudflare Worker secrets.
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">
              Cloudflare Worker API Base URL
            </label>
            <input
              type="url"
              value={draft.workerApiBaseUrl}
              onChange={(e) => setDraft({ ...draft, workerApiBaseUrl: e.target.value })}
              placeholder="https://api.zestro.example.workers.dev"
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">
              R2 Public Media Bucket URL
            </label>
            <input
              type="url"
              value={draft.r2PublicBucketUrl}
              onChange={(e) => setDraft({ ...draft, r2PublicBucketUrl: e.target.value })}
              placeholder="https://media.zestro.example"
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
        </div>
      </div>
    </form>
  );
};
