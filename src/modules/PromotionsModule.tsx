import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { Promotion } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { formatCurrency } from '../services/api';

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

  const todayIso = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Omit<Promotion, 'id' | 'usageCount'>>({
    title: '',
    code: '',
    discountType: 'Percentage',
    discountValue: 15,
    minOrder: 0,
    validFrom: todayIso,
    validUntil: '2027-12-31',
    active: true,
    description: '',
  });

  const openNew = () => {
    setEditing(null);
    setForm({
      title: '',
      code: '',
      discountType: 'Percentage',
      discountValue: 15,
      minOrder: 0,
      validFrom: todayIso,
      validUntil: '2027-12-31',
      active: true,
      description: '',
    });
    setModalOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      title: p.title,
      code: p.code,
      discountType: p.discountType,
      discountValue: p.discountValue,
      minOrder: p.minOrder,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
      active: p.active,
      description: p.description,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.code.trim() || saving) return;
    setSaving(true);
    try {
      const ok = await onSavePromotion(
        {
          id: editing ? editing.id : `promo-${Date.now()}`,
          usageCount: editing ? editing.usageCount : 0,
          ...form,
          title: form.title.trim(),
          code: form.code.trim().toUpperCase(),
          description: form.description.trim(),
        },
        !editing
      );
      if (ok !== false) setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#F3EBDD]/70">
          Create live promo codes validated server-side during customer checkout.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
          >
            <Plus className="h-4 w-4" /> New Promotion
          </button>
        )}
      </div>

      {promotions.length === 0 ? (
        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-10 text-center">
          <p className="font-serif text-lg font-semibold text-[#F3EBDD]">No promotions active</p>
          <p className="mt-1 text-xs text-[#F3EBDD]/60">
            Create percentage or fixed-amount promo codes that guests can apply in their cart.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {promotions.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-5 transition hover:border-[#D7A65A]/45"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#101B17] text-[#D7A65A]">
                    <Tag className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-serif text-base font-semibold text-[#F3EBDD]">{p.title}</h3>
                    <span className="font-mono text-xs font-bold text-[#D7A65A]">{p.code}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => void onSavePromotion({ ...p, active: !p.active }, false)}
                >
                  <Badge variant={p.active ? 'emerald' : 'neutral'}>
                    {p.active ? 'Active' : 'Paused'}
                  </Badge>
                </button>
              </div>

              <p className="mt-3 flex-1 text-xs leading-relaxed text-[#F3EBDD]/70">
                {p.description || `Minimum order ${formatCurrency(p.minOrder, currency)}`}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[#2C3D34] bg-[#101B17] p-3 text-xs">
                <div>
                  <p className="text-[#F3EBDD]/50">Offer</p>
                  <p className="font-semibold text-[#F3EBDD]">
                    {p.discountType === 'Percentage'
                      ? `${p.discountValue}% Off`
                      : p.discountType === 'Fixed Amount'
                      ? `${formatCurrency(p.discountValue, currency)} Off`
                      : 'Complimentary Item'}
                  </p>
                </div>
                <div>
                  <p className="text-[#F3EBDD]/50">Redemptions</p>
                  <p className="font-semibold text-[#D7A65A]">{p.usageCount} uses</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[#2C3D34] pt-3 text-xs text-[#F3EBDD]/55">
                <span>
                  {p.validFrom ? `${p.validFrom} → ` : ''}
                  {p.validUntil || 'Ongoing'}
                </span>
                {canManage && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/80 hover:text-[#D7A65A]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-rose-300/80 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Promotion' : 'Create Promotion'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Title</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Promo Code</label>
              <input
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 font-mono text-sm text-[#D7A65A]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Type</label>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm({ ...form, discountType: e.target.value as Promotion['discountType'] })
                }
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-xs text-[#F3EBDD]"
              >
                <option value="Percentage">Percentage</option>
                <option value="Fixed Amount">Fixed Amount</option>
                <option value="Complimentary Item">Complimentary Item</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Value</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Minimum Order</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.minOrder}
                onChange={(e) => setForm({ ...form, minOrder: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Valid From</label>
              <input
                type="date"
                required
                value={form.validFrom}
                onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Valid Until</label>
              <input
                type="date"
                required
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Offer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Promotion"
        message={`Delete promo code "${deleteTarget?.code}"?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeletePromotion(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
