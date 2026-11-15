import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Category, MenuItem } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';

export const CategoriesModule: React.FC<{
  categories: Category[];
  menuItems: MenuItem[];
  canManage?: boolean;
  onSaveCategory: (cat: Category, isNew: boolean) => Promise<boolean> | void;
  onDeleteCategory: (id: string) => void;
  onReorderCategory: (id: string, direction: 'up' | 'down') => void;
}> = ({ categories, menuItems, canManage = true, onSaveCategory, onDeleteCategory, onReorderCategory }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    slug: string;
    description: string;
    categoryType: 'food' | 'beverage';
    active: boolean;
  }>({
    name: '',
    slug: '',
    description: '',
    categoryType: 'food',
    active: true,
  });

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', slug: '', description: '', categoryType: 'food', active: true });
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      categoryType: cat.categoryType === 'beverage' ? 'beverage' : 'food',
      active: cat.active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const slug =
        form.slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const ok = await onSaveCategory(
        {
          id: editing ? editing.id : `cat-${Date.now()}`,
          name: form.name.trim(),
          slug,
          description: form.description.trim(),
          categoryType: form.categoryType,
          sortOrder: editing ? editing.sortOrder : categories.length + 1,
          active: form.active,
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
        <p className="text-sm text-neutral-500">
          Organize food &amp; beverage sections and control display order on the customer digital menu.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> New Category
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#111111]">No categories created yet</p>
          <p className="mt-1 text-xs text-neutral-500">
            Add your first food or beverage category to organize dishes on the customer menu.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F5F5F5] text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-5 py-3.5">Order</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Section</th>
                  <th className="px-5 py-3.5">Dishes</th>
                  <th className="px-5 py-3.5">Status</th>
                  {canManage && <th className="px-5 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {sorted.map((cat, idx) => {
                  const count = menuItems.filter((m) => m.categoryId === cat.id).length;
                  return (
                    <tr key={cat.id} className="transition hover:bg-[#F5F5F5]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={!canManage || idx === 0}
                            onClick={() => onReorderCategory(cat.id, 'up')}
                            className="rounded-lg border border-[#E5E7EB] p-1 text-neutral-500 disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={!canManage || idx === sorted.length - 1}
                            onClick={() => onReorderCategory(cat.id, 'down')}
                            className="rounded-lg border border-[#E5E7EB] p-1 text-neutral-500 disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#111111]">{cat.name}</p>
                        <p className="text-xs text-neutral-500">{cat.description || `/${cat.slug}`}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={cat.categoryType === 'beverage' ? 'amber' : 'gold'}>
                          {cat.categoryType === 'beverage' ? 'Beverages' : 'Food Menu'}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-[#16A34A]">{count} items</td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => void onSaveCategory({ ...cat, active: !cat.active }, false)}
                        >
                          <Badge variant={cat.active ? 'emerald' : 'neutral'}>
                            {cat.active ? 'Visible' : 'Hidden'}
                          </Badge>
                        </button>
                      </td>
                      {canManage && (
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(cat)}
                              className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] p-2 text-neutral-500 hover:text-[#16A34A]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(cat)}
                              className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] p-2 text-rose-600 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Category' : 'New Category'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111] focus:border-[#16A34A] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Menu Tab</label>
              <select
                value={form.categoryType}
                onChange={(e) =>
                  setForm({ ...form, categoryType: e.target.value === 'beverage' ? 'beverage' : 'food' })
                }
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111] focus:border-[#16A34A] focus:outline-none"
              >
                <option value="food">Food Menu</option>
                <option value="beverage">Drinks &amp; Beverages</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">URL Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="auto-generated-if-blank"
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111] focus:border-[#16A34A] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111] focus:border-[#16A34A] focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#111111]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-[#16A34A]"
            />
            Visible on customer menu
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#16A34A] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Category'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Category"
        message={`Delete "${deleteTarget?.name}"? Dishes in this category will remain in the catalog as Uncategorized.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteCategory(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
