import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Category, MenuItem } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';

export const CategoriesModule: React.FC<{
  categories: Category[];
  menuItems: MenuItem[];
  onSaveCategory: (cat: Category, isNew: boolean) => void;
  onDeleteCategory: (id: string) => void;
  onReorderCategory: (id: string, direction: 'up' | 'down') => void;
}> = ({ categories, menuItems, onSaveCategory, onDeleteCategory, onReorderCategory }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', active: true });

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', slug: '', description: '', active: true });
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      active: cat.active,
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const slug =
      form.slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    onSaveCategory(
      {
        id: editing ? editing.id : `cat-${Date.now()}`,
        name: form.name.trim(),
        slug,
        description: form.description.trim(),
        sortOrder: editing ? editing.sortOrder : categories.length + 1,
        active: form.active,
      },
      !editing
    );
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#F3EBDD]/70">
          Organize menu sections and control display order on the customer digital menu.
        </p>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
        >
          <Plus className="h-4 w-4" /> New Category
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#2C3D34] bg-[#101B17]/70 text-xs uppercase tracking-wider text-[#F3EBDD]/60">
              <tr>
                <th className="px-5 py-3.5">Order</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Dishes</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2C3D34]">
              {sorted.map((cat, idx) => {
                const count = menuItems.filter((m) => m.categoryId === cat.id).length;
                return (
                  <tr key={cat.id} className="transition hover:bg-[#101B17]/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onReorderCategory(cat.id, 'up')}
                          className="rounded-lg border border-[#2C3D34] p-1 text-[#F3EBDD]/70 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === sorted.length - 1}
                          onClick={() => onReorderCategory(cat.id, 'down')}
                          className="rounded-lg border border-[#2C3D34] p-1 text-[#F3EBDD]/70 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-serif font-semibold text-[#F3EBDD]">{cat.name}</p>
                      <p className="text-xs text-[#F3EBDD]/55">{cat.description}</p>
                    </td>
                    <td className="px-5 py-4 text-[#D7A65A]">{count} items</td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => onSaveCategory({ ...cat, active: !cat.active }, false)}
                      >
                        <Badge variant={cat.active ? 'emerald' : 'neutral'}>
                          {cat.active ? 'Visible' : 'Hidden'}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(cat)}
                          className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-2 text-[#F3EBDD]/80 hover:text-[#D7A65A]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(cat)}
                          className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-2 text-rose-300/80 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Category' : 'New Category'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">URL Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="auto-generated-if-blank"
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#F3EBDD]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-[#D7A65A]"
            />
            Visible on menu
          </label>
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
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17]"
            >
              Save Category
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Category"
        message={`Delete "${deleteTarget?.name}"? Dishes in this category will remain in the catalog.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteCategory(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
