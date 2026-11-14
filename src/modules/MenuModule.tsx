import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Upload, Star } from 'lucide-react';
import { Category, MediaAsset, MenuItem } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { formatCurrency } from '../services/api';
import { optimizeImageUpload } from '../utils/imageUpload';

export const MenuModule: React.FC<{
  items: MenuItem[];
  categories: Category[];
  currency: string;
  mediaAssets: MediaAsset[];
  globalSearch: string;
  openCreateSignal: number;
  onSaveItem: (item: MenuItem, isNew: boolean) => void;
  onDeleteItem: (id: string) => void;
}> = ({ items, categories, currency, mediaAssets, globalSearch, openCreateSignal, onSaveItem, onDeleteItem }) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);

  const [form, setForm] = useState<Omit<MenuItem, 'id' | 'ordersCount'>>({
    name: '',
    categoryId: categories[0]?.id ?? '',
    price: 24,
    description: '',
    imageUrl: mediaAssets[1]?.url ?? '/images/tenderloin-steak.jpg',
    available: true,
    featured: false,
    prepMinutes: 18,
    dietaryTags: [],
  });
  const [tagInput, setTagInput] = useState('');

  React.useEffect(() => {
    if (openCreateSignal > 0) {
      openNew();
    }
  }, [openCreateSignal]);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: '',
      categoryId: categories[0]?.id ?? '',
      price: 24,
      description: '',
      imageUrl: mediaAssets[1]?.url ?? '/images/tenderloin-steak.jpg',
      available: true,
      featured: false,
      prepMinutes: 18,
      dietaryTags: [],
    });
    setTagInput('');
    setModalOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      price: item.price,
      description: item.description,
      imageUrl: item.imageUrl,
      available: item.available,
      featured: item.featured,
      prepMinutes: item.prepMinutes,
      dietaryTags: item.dietaryTags,
    });
    setTagInput(item.dietaryTags.join(', '));
    setModalOpen(true);
  };

  const handleLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const image = await optimizeImageUpload(file);
      setForm((current) => ({ ...current, imageUrl: image.dataUrl }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not process this image.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: MenuItem = {
      id: editing ? editing.id : `menu-${Date.now()}`,
      ordersCount: editing ? editing.ordersCount : 0,
      ...form,
      dietaryTags: tags,
    };
    onSaveItem(payload, !editing);
    setModalOpen(false);
  };

  const q = (search || globalSearch).toLowerCase();
  const filtered = items.filter((item) => {
    const matchCat = categoryFilter === 'all' || item.categoryId === categoryFilter;
    const matchText =
      !q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
    return matchCat && matchText;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F3EBDD]/45" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes..."
              className="w-full rounded-xl border border-[#2C3D34] bg-[#1D2922] py-2.5 pl-9 pr-3 text-sm text-[#F3EBDD] placeholder-[#F3EBDD]/40 focus:border-[#D7A65A] focus:outline-none"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-[#2C3D34] bg-[#1D2922] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] transition hover:bg-[#e3b772]"
        >
          <Plus className="h-4 w-4" /> New Dish
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => {
          const catName = categories.find((c) => c.id === item.categoryId)?.name ?? 'Uncategorized';
          return (
            <div
              key={item.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922] transition hover:border-[#D7A65A]/45"
            >
              <div className="relative h-44 w-full bg-[#101B17]">
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <Badge variant={item.available ? 'emerald' : 'rose'}>
                    {item.available ? 'Available' : 'Sold Out'}
                  </Badge>
                  {item.featured && (
                    <Badge variant="gold">
                      <Star className="h-3 w-3 fill-current" /> Featured
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-[#D7A65A]">
                      {catName}
                    </p>
                    <h3 className="mt-0.5 font-serif text-lg font-semibold text-[#F3EBDD]">
                      {item.name}
                    </h3>
                  </div>
                  <span className="font-serif text-lg font-bold text-[#D7A65A]">
                    {formatCurrency(item.price, currency)}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-[#F3EBDD]/70">
                  {item.description}
                </p>

                {item.dietaryTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.dietaryTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-[#2C3D34] bg-[#101B17] px-2 py-0.5 text-[11px] text-[#F3EBDD]/70"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-[#2C3D34] pt-3">
                  <button
                    type="button"
                    onClick={() => onSaveItem({ ...item, available: !item.available }, false)}
                    className="text-xs font-medium text-[#F3EBDD]/75 hover:text-[#D7A65A]"
                  >
                    {item.available ? 'Mark Sold Out' : 'Mark Available'}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-2 text-[#F3EBDD]/80 transition hover:border-[#D7A65A]/50 hover:text-[#D7A65A]"
                      aria-label={`Edit ${item.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-2 text-rose-300/80 transition hover:border-rose-500/50 hover:text-rose-300"
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Menu Item' : 'Create Menu Item'}
        subtitle="Changes update this demo catalog and save in your browser"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Dish Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
                placeholder="e.g. Seared Hokkaido Scallops"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Category</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Price</label>
              <input
                type="number"
                step="0.5"
                min="0"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Prep Time (mins)</label>
              <input
                type="number"
                min="1"
                value={form.prepMinutes}
                onChange={(e) => setForm({ ...form, prepMinutes: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
              placeholder="Describe ingredients, preparation, and plating..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">
              Dietary Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD] focus:border-[#D7A65A] focus:outline-none"
              placeholder="Gluten-Free, Chef Signature"
            />
          </div>

          <div className="rounded-xl border border-[#2C3D34] bg-[#101B17] p-4">
            <label className="mb-2 block text-xs font-medium text-[#F3EBDD]/75">Dish Photo</label>
            <div className="flex flex-wrap items-center gap-4">
              <img
                src={form.imageUrl}
                alt="Preview"
                className="h-20 w-24 rounded-xl border border-[#2C3D34] object-cover"
              />
              <div className="flex-1 space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#D7A65A]/45 bg-[#1D2922] px-3.5 py-2 text-xs font-medium text-[#D7A65A] hover:bg-[#D7A65A]/10">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Local Image</span>
                  <input type="file" accept="image/*" onChange={handleLocalFile} className="hidden" />
                </label>
                <select
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  className="block w-full rounded-xl border border-[#2C3D34] bg-[#1D2922] px-3 py-2 text-xs text-[#F3EBDD]"
                >
                  {mediaAssets.map((m) => (
                    <option key={m.id} value={m.url}>
                      Library: {m.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#F3EBDD]">
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm({ ...form, available: e.target.checked })}
                className="h-4 w-4 accent-[#D7A65A]"
              />
              Available for ordering
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#F3EBDD]">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                className="h-4 w-4 accent-[#D7A65A]"
              />
              Feature on Homepage
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t border-[#2C3D34] pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-2 text-sm text-[#F3EBDD]/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
            >
              {editing ? 'Save Changes' : 'Create Dish'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Menu Item"
        message={`Remove "${deleteTarget?.name}" from the menu? This action cannot be undone.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteItem(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
