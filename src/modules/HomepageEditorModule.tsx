import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ArrowUp, ArrowDown, Upload, Save, ImageOff, Loader2 } from 'lucide-react';
import { HomepageConfig, MediaAsset } from '../types';
import { Badge } from '../components/ui/Primitives';
import { uploadMediaToR2 } from '../services/liveApi';

export const HomepageEditorModule: React.FC<{
  config: HomepageConfig;
  mediaAssets: MediaAsset[];
  canManage?: boolean;
  onAssetUploaded: (asset: MediaAsset) => void;
  onSaveConfig: (next: HomepageConfig) => Promise<boolean> | void;
  onNotify: (msg: string, tone?: 'success' | 'info' | 'warning') => void;
}> = ({ config, mediaAssets, canManage = true, onAssetUploaded, onSaveConfig, onNotify }) => {
  const [draft, setDraft] = useState<HomepageConfig>(config);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadMediaToR2(file, 'banners', 'Hero Banner', 1920);
      onAssetUploaded(asset);
      setDraft((current) => ({
        ...current,
        heroImageKey: asset.r2Key,
        heroImageUrl: asset.url,
      }));
      onNotify('Hero image uploaded to Cloudflare R2');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not upload hero image.', 'warning');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const toggleSection = (id: string) => {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    }));
  };

  const moveSection = (id: string, dir: 'up' | 'down') => {
    const sorted = [...draft.sections].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.id === id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const temp = sorted[idx].order;
    sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order };
    sorted[swapIdx] = { ...sorted[swapIdx], order: temp };
    setDraft((d) => ({ ...d, sections: sorted }));
  };

  const handlePublish = async () => {
    if (!canManage || saving) return;
    setSaving(true);
    try {
      await onSaveConfig(draft);
    } finally {
      setSaving(false);
    }
  };

  const sortedSections = [...draft.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <div className="space-y-6 xl:col-span-3">
        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Hero Section</h2>
            {canManage && (
              <button
                type="button"
                disabled={saving || uploading}
                onClick={() => void handlePublish()}
                className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2 text-xs font-semibold text-[#101B17] hover:bg-[#e3b772] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> {saving ? 'Publishing...' : 'Publish Changes'}
              </button>
            )}
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Headline</label>
              <input
                type="text"
                disabled={!canManage}
                value={draft.heroHeadline}
                onChange={(e) => setDraft({ ...draft, heroHeadline: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">
                Subheadline / Description
              </label>
              <textarea
                rows={3}
                disabled={!canManage}
                value={draft.heroSubheadline}
                onChange={(e) => setDraft({ ...draft, heroSubheadline: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">
                  Primary CTA Label
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={draft.heroCtaText}
                  onChange={(e) => setDraft({ ...draft, heroCtaText: e.target.value })}
                  className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">
                  Hero Image Source (R2)
                </label>
                <div className="flex gap-2">
                  <select
                    disabled={!canManage}
                    value={draft.heroImageKey || ''}
                    onChange={(e) => {
                      const key = e.target.value;
                      if (!key) {
                        setDraft({ ...draft, heroImageKey: '', heroImageUrl: '' });
                        return;
                      }
                      const asset = mediaAssets.find((m) => m.r2Key === key);
                      if (asset) {
                        setDraft({ ...draft, heroImageKey: asset.r2Key, heroImageUrl: asset.url });
                      }
                    }}
                    className="flex-1 rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2 text-xs text-[#F3EBDD]"
                  >
                    <option value="">Default website hero backdrop</option>
                    {mediaAssets.map((m) => (
                      <option key={m.id} value={m.r2Key}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                  {canManage && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#D7A65A]/45 bg-[#101B17] px-3 py-2 text-xs font-medium text-[#D7A65A]">
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploading}
                        onChange={handleHeroUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Promotional Banner</h2>
              <p className="text-xs text-[#F3EBDD]/55">Top announcement bar on the customer website</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#D7A65A]">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={draft.promoBannerEnabled}
                onChange={(e) => setDraft({ ...draft, promoBannerEnabled: e.target.checked })}
                className="h-4 w-4 accent-[#D7A65A]"
              />
              Enabled
            </label>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Banner Copy</label>
              <input
                type="text"
                disabled={!canManage}
                value={draft.promoBannerText}
                onChange={(e) => setDraft({ ...draft, promoBannerText: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Promo Code</label>
              <input
                type="text"
                disabled={!canManage}
                value={draft.promoBannerCode}
                onChange={(e) => setDraft({ ...draft, promoBannerCode: e.target.value.toUpperCase() })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 font-mono text-sm text-[#D7A65A]"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
          <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Section Visibility &amp; Order</h2>
          <div className="mt-4 space-y-2.5">
            {sortedSections.map((sec, idx) => (
              <div
                key={sec.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#F3EBDD]">{sec.label}</p>
                  <p className="truncate text-xs text-[#F3EBDD]/55">{sec.description}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!canManage || idx === 0}
                    onClick={() => moveSection(sec.id, 'up')}
                    className="rounded-lg border border-[#2C3D34] p-1.5 text-[#F3EBDD]/70 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!canManage || idx === sortedSections.length - 1}
                    onClick={() => moveSection(sec.id, 'down')}
                    className="rounded-lg border border-[#2C3D34] p-1.5 text-[#F3EBDD]/70 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => toggleSection(sec.id)}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                      sec.visible
                        ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                        : 'border-[#2C3D34] bg-[#1D2922] text-[#F3EBDD]/50'
                    }`}
                  >
                    {sec.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {sec.visible ? 'Visible' : 'Hidden'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="xl:col-span-2">
        <div className="sticky top-24 rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#D7A65A]">
              Live Hero Preview
            </span>
            <Badge variant="gold">Live Sync</Badge>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#2C3D34] bg-[#101B17]">
            {draft.promoBannerEnabled && (
              <div className="bg-[#D7A65A] px-3 py-1.5 text-center text-[11px] font-semibold text-[#101B17]">
                {draft.promoBannerText || 'Special promotion active'}
              </div>
            )}
            <div className="relative h-64 bg-[#15201B]">
              {draft.heroImageUrl ? (
                <img
                  src={draft.heroImageUrl}
                  alt="Hero preview"
                  className="h-full w-full object-cover opacity-65"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#F3EBDD]/20">
                  <ImageOff className="h-10 w-10" />
                </div>
              )}
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#101B17] via-[#101B17]/50 to-transparent p-5">
                <h3 className="font-serif text-xl font-bold leading-snug text-[#F3EBDD]">
                  {draft.heroHeadline}
                </h3>
                <p className="mt-2 line-clamp-2 text-xs text-[#F3EBDD]/80">{draft.heroSubheadline}</p>
                <div className="mt-4">
                  <span className="inline-block rounded-lg bg-[#D7A65A] px-4 py-2 text-xs font-semibold text-[#101B17]">
                    {draft.heroCtaText}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#F3EBDD]/50">
                Active Page Flow
              </p>
              {sortedSections
                .filter((s) => s.visible)
                .map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-[#2C3D34] bg-[#1D2922]/70 px-3 py-2 text-xs text-[#F3EBDD]/85"
                  >
                    <span>
                      {i + 1}. {s.label}
                    </span>
                    <span className="text-[10px] text-emerald-300">LIVE</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
