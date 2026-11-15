import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Tag, Sparkles, Eye } from 'lucide-react';
import { Promotion } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { formatCurrency } from '../services/api';

function isCurrentlyValidOffer(p: Promotion, todayIso: string): boolean {
  if (!p.active) return false;
  const from = (p.validFrom || '').slice(0, 10);
  const until = (p.validUntil || '').slice(0, 10);
  if (from && from > todayIso) return false;
  if (until && until < todayIso) return false;
  return true;
}

function getOfferDiscountBadge(p: {
  discountText?: string;
  code?: string;
  discountType: Promotion['discountType'];
  discountValue: number;
}, currency: string): string {
  if (p.discountText?.trim()) return p.discountText.trim();
  if (p.code?.trim()) {
    if (p.discountType === 'Percentage' && p.discountValue > 0) return `${p.discountValue}% OFF`;
    if (p.discountType === 'Fixed Amount' && p.discountValue > 0) {
      return `${formatCurrency(p.discountValue, currency)} OFF`;
    }
  }
  return '';
}

export const PromotionsModule: React.FC<{
  promotions: Promotion[];
  currency: string;
  canManage?: boolean;
  onSavePromotion: (promo: Promotion, isNew: boolean) => Promise<boolean> | void;
  onDeletePromotion: (id: string) => void;
}> = ({ promotions, currency, canManage = true, onSavePromotion, onDeletePromotion }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Omit<Promotion, 'id' | 'usageCount'>>({
    title: '',
    description: '',
    discountText: '',
    code: '',
    discountType: 'Percentage',
    discountValue: 15,
    minOrder: 0,
    validFrom: todayIso,
    validUntil: '2027-12-31',
    active: true,
  });

  const activeHomepageOffers = useMemo(
    () => promotions.filter((p) => isCurrentlyValidOffer(p, todayIso)),
    [promotions, todayIso]
  );

  const openNew = () => {
    setEditing(null);
    setFormError(null);
    setForm({
      title: '',
      description: '',
      discountText: '',
      code: '',
      discountType: 'Percentage',
      discountValue: 15,
      minOrder: 0,
      validFrom: todayIso,
      validUntil: '2027-12-31',
      active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditing(p);
    setFormError(null);
    setForm({
      title: p.title,
      description: p.description,
      discountText: p.discountText || '',
      code: p.code || '',
      discountType: p.discountType,
      discountValue: p.discountValue,
      minOrder: p.minOrder,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
      active: p.active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanTitle = form.title.trim();
    if (!cleanTitle || saving) {
      if (!cleanTitle) setFormError('Offer title is required.');
      return;
    }
    if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
      setFormError('Start date cannot be after end date.');
      return;
    }
    const cleanCode = form.code.trim().toUpperCase();
    if (cleanCode && !/^[A-Z0-9_-]{2,32}$/.test(cleanCode)) {
      setFormError('Promo code must be 2–32 characters (letters, numbers, - or _).');
      return;
    }

    setSaving(true);
    try {
      const ok = await onSavePromotion(
        {
          id: editing ? editing.id : `promo-${Date.now()}`,
          usageCount: editing ? editing.usageCount : 0,
          ...form,
          title: cleanTitle,
          description: form.description.trim(),
          discountText: (form.discountText || '').trim(),
          code: cleanCode,
          hasPromoCode: cleanCode.length > 0,
        },
        !editing
      );
      if (ok !== false) setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const modalPreviewBadge = getOfferDiscountBadge(form, currency);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Manage homepage announcement offers and optional checkout promo codes. Active, in-date offers appear automatically on the customer website header.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> New Offer
          </button>
        )}
      </div>

      {/* Live Customer Header Banner Preview */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#16A34A]">
            <Eye className="h-3.5 w-3.5" /> Customer Homepage Banner Preview
          </span>
          <span className="text-[11px] text-neutral-500">
            {activeHomepageOffers.length === 0
              ? 'Hidden on customer website (no active in-date offers)'
              : `${activeHomepageOffers.length} active offer${activeHomepageOffers.length > 1 ? 's' : ''} live`}
          </span>
        </div>

        {activeHomepageOffers.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-2.5 rounded-xl border border-[#16A34A]/40 bg-[#F5F5F5] px-4 py-2.5 text-center text-xs text-[#111111]">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
            {getOfferDiscountBadge(activeHomepageOffers[0], currency) && (
              <span className="rounded-full bg-[#16A34A] px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[#101210]">
                {getOfferDiscountBadge(activeHomepageOffers[0], currency)}
              </span>
            )}
            <span className="font-semibold text-[#111111]">{activeHomepageOffers[0].title}</span>
            {activeHomepageOffers[0].description && (
              <span className="text-neutral-500">— {activeHomepageOffers[0].description}</span>
            )}
            {activeHomepageOffers[0].code && (
              <span className="rounded-md border border-[#16A34A]/40 bg-[#16A34A]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#16A34A]">
                Code: {activeHomepageOffers[0].code}
              </span>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F5F5F5] px-4 py-3 text-center text-xs text-neutral-500">
            No active offers within today&apos;s date range. The announcement banner is hidden on the customer homepage.
          </div>
        )}
      </div>

      {promotions.length === 0 ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#111111]">No offers created yet</p>
          <p className="mt-1 text-xs text-neutral-500">
            Create a homepage announcement offer or a checkout promo code to highlight specials for your guests.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {promotions.map((p) => {
            const discountBadge = getOfferDiscountBadge(p, currency);
            const liveNow = isCurrentlyValidOffer(p, todayIso);
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 transition hover:border-[#16A34A]/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F5F5F5] text-[#16A34A]">
                      <Tag className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-[#111111]">
                        {p.title}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {p.code ? (
                          <span className="font-mono text-xs font-bold text-[#16A34A]">
                            {p.code}
                          </span>
                        ) : (
                          <span className="text-[11px] text-neutral-500">
                            Homepage announcement
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => void onSavePromotion({ ...p, active: !p.active }, false)}
                    title="Toggle active status"
                  >
                    <Badge variant={liveNow ? 'emerald' : p.active ? 'amber' : 'neutral'}>
                      {liveNow ? 'Live' : p.active ? 'Scheduled' : 'Paused'}
                    </Badge>
                  </button>
                </div>

                <p className="mt-3 flex-1 text-xs leading-relaxed text-neutral-500">
                  {p.description || (p.code ? `Minimum order ${formatCurrency(p.minOrder, currency)}` : 'Promotional announcement')}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] p-3 text-xs">
                  <div>
                    <p className="text-neutral-500">Highlight</p>
                    <p className="truncate font-semibold text-[#111111]">
                      {discountBadge || 'Announcement'}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-500">{p.code ? 'Redemptions' : 'Checkout'}</p>
                    <p className="font-semibold text-[#16A34A]">
                      {p.code ? `${p.usageCount} uses` : 'Display only'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-xs text-neutral-500">
                  <span>
                    {p.validFrom ? `${p.validFrom} → ` : ''}
                    {p.validUntil || 'Ongoing'}
                  </span>
                  {canManage && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        aria-label={`Edit ${p.title}`}
                        onClick={() => openEdit(p)}
                        className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] p-1.5 text-neutral-500 hover:text-[#16A34A]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${p.title}`}
                        onClick={() => setDeleteTarget(p)}
                        className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] p-1.5 text-rose-600 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Offer' : 'Create Offer'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                Offer Title *
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Weekend Chef's Special"
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                Discount Text (optional)
              </label>
              <input
                type="text"
                maxLength={40}
                value={form.discountText || ''}
                onChange={(e) => setForm({ ...form, discountText: e.target.value })}
                placeholder="e.g. 20% OFF or Free Dessert"
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">
              Short Promotional Description
            </label>
            <textarea
              rows={2}
              maxLength={240}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Enjoy our seasonal tasting platter every Friday & Saturday evening."
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">
              Coupon / Promo Code (optional)
            </label>
            <input
              type="text"
              maxLength={32}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="Leave blank for homepage announcement only"
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 font-mono text-sm text-[#16A34A]"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Optional. Add a code only if guests should also apply a discount at checkout.
            </p>
          </div>

          {form.code.trim().length > 0 && (
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] p-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-500">Type</label>
                <select
                  value={form.discountType}
                  onChange={(e) =>
                    setForm({ ...form, discountType: e.target.value as Promotion['discountType'] })
                  }
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3 py-2 text-xs text-[#111111]"
                >
                  <option value="Percentage">Percentage</option>
                  <option value="Fixed Amount">Fixed Amount</option>
                  <option value="Complimentary Item">Complimentary Item</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-500">Value</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3 py-2 text-sm text-[#111111]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-500">Min Order</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.minOrder}
                  onChange={(e) => setForm({ ...form, minOrder: Number(e.target.value) })}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3 py-2 text-sm text-[#111111]"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Start Date</label>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">End Date</label>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-[#111111]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-[#16A34A]"
            />
            Active (publish on customer homepage during validity dates)
          </label>

          {/* Live Customer Homepage Banner Preview */}
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#16A34A]">
              Customer Homepage Preview
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-[#16A34A]/40 bg-[#F5F5F5] px-3 py-2 text-center text-xs text-[#111111]">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
              {modalPreviewBadge && (
                <span className="rounded-full bg-[#16A34A] px-2 py-0.5 text-[10px] font-bold text-[#101210]">
                  {modalPreviewBadge}
                </span>
              )}
              <span className="font-semibold">
                {form.title.trim() || 'Your offer title'}
              </span>
              {form.description.trim() && (
                <span className="text-neutral-500">— {form.description.trim()}</span>
              )}
              {form.code.trim() && (
                <span className="rounded border border-[#16A34A]/40 bg-[#16A34A]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#16A34A]">
                  Code: {form.code.trim().toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {formError && (
            <p className="text-xs font-medium text-rose-600">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-[#E5E7EB] px-4 py-2 text-xs text-[#111111]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#16A34A] px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Save Offer' : 'Create Offer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeletePromotion(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete Offer"
        message={`Delete "${deleteTarget?.title}"? It will immediately stop appearing on the customer website.`}
        confirmLabel="Delete"
      />
    </div>
  );
};
