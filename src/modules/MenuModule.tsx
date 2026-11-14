import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Upload, Star, ImageOff, Loader2 } from 'lucide-react';
import { Category, MediaAsset, MenuItem } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { formatCurrency } from '../services/api';
import { uploadMediaToR2 } from '../services/liveApi';

export const MenuModule: React.FC<{
  items: MenuItem[];
  categories: Category[];
  currency: string;
  mediaAssets: MediaAsset[];
  globalSearch: string;
  openCreateSignal: number;
  canManage?: boolean;
  onAssetUploaded: (asset: MediaAsset) => void;
  onSaveItem: (item: MenuItem, isNew: boolean) => Promise<boolean> | void;
  onDeleteItem: (id: string) => void;
  onNotify: (msg: string, tone?: 'success' | 'info' | 'warning') => void;
}> = ({
  items,
  categories,
  currency,
  mediaAssets,
  globalSearch,
  openCreateSignal,
  canManage = true,
  onAssetUploaded,
  onSaveItem,
  onDeleteItem,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Omit<MenuItem, 'id' | 'ordersCount'>>({
    name: '',
    categoryId: categories[0]?.id ?? '',
    price: 0,
    description: '',
    imageUrl: '',
    imageKey: null,
    available: true,
    featured: false,
    prepMinutes: 15,
    dietaryTags: [],
  });
  const [tagInput, setTagInput] = useState('');

  React.useEffect(() => {
    if (openCreateSignal > 0 && canManage) {
      openNew();
    }
  }, [openCreateSignal]);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: '',
      categoryId: categories[0]?.id ?? '',
      price: 0,
      description: '',
      imageUrl: mediaAssets[0]?.url ?? '',
      imageKey: mediaAssets[0]?.r2Key ?? null,
      available: true,
      featured: false,
      prepMinutes: 15,
      dietaryTags: [],
    });
    setTagInput('');
    setModalOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      categoryId: item.categoryId || categories[0]?.id || '',
      price: item.price,
      description: item.description,
      imageUrl: item.imageUrl || '',
      imageKey: item.imageKey ?? null,
      available: item.available,
      featured: item.featured,
      prepMinutes: item.prepMinutes || 15,
      dietaryTags: item.dietaryTags || [],
      options: item.options,
    });
    setTagInput((item.dietaryTags || []).join(', '));
    setModalOpen(true);
  };

  const handleR2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const asset = await uploadMediaToR2(file, 'dishes', form.name.trim() || undefined);
      onAssetUploaded(asset);
      setForm((current) => ({
        ...current,
        imageKey: asset.r2Key,
        imageUrl: asset.url,
      }));
      onNotify(`Uploaded "${asset.title}" to Cloudflare R2`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not upload dish image.', 'warning');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const tags = tagInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const payload: MenuItem = {
        id: editing ? editing.id : `menu-${Date.now()}`,
        ordersCount: editing ? editing.ordersCount : 0,
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        dietaryTags: tags,
      };
      const ok = await onSaveItem(payload, !editing);
      if (ok !== false) {
        setModalOpen(false);
      }
    } finally {
      setSaving(false);
    }
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

        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] transition hover:bg-[#e3b772]"
          >
            <Plus className="h-4 w-4" /> New Dish
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-10 text-center">
          <p className="font-serif text-lg font-semibold text-[#F3EBDD]">
            {items.length === 0 ? 'Your live menu is empty' : 'No dishes match your filter'}
          </p>
          <p className="mt-1 text-xs text-[#F3EBDD]/60">
            {items.length === 0
              ? 'Create your first category and menu dish to publish it directly to the customer website.'
              : 'Try clearing the search query or selecting All Categories.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const catName = categories.find((c) => c.id === item.categoryId)?.name ?? 'Uncategorized';
            return (
              <div
                key={item.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922] transition hover:border-[#D7A65A]/45"
              >
                <div className="relative h-44 w-full bg-[#101B17]">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[#F3EBDD]/35">
                      <ImageOff className="h-7 w-7" />
                      <span className="text-xs">No dish photo</span>
                    </div>
                  )}
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
                    {item.description || 'No description added yet.'}
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

                  {canManage && (
                    <div className="mt-4 flex items-center justify-between border-t border-[#2C3D34] pt-3">
                      <button
                        type="button"
                        onClick={() => void onSaveItem({ ...item, available: !item.available }, false)}
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
        title={editing ? 'Edit Menu Item' : 'Create Menu Item'}
        subtitle="Changes persist immediately to your Cloudflare D1 catalog and customer menu"
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
                <option value="">Uncategorized</option>
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
                step="0.01"
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
                min="0"
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
              placeholder="Gluten-Free, Spicy, Chef Signature"
            />
          </div>

          <div className="rounded-xl border border-[#2C3D34] bg-[#101B17] p-4">
            <label className="mb-2 block text-xs font-medium text-[#F3EBDD]/75">Dish Photo (Cloudflare R2)</label>
            <div className="flex flex-wrap items-center gap-4">
              {form.imageUrl ? (
                <img
                  src={form.imageUrl}
                  alt="Preview"
                  className="h-20 w-24 rounded-xl border border-[#2C3D34] object-cover"
                />
              ) : (
                <div className="flex h-20 w-24 items-center justify-center rounded-xl border border-[#2C3D34] bg-[#1D2922] text-[#F3EBDD]/35">
                  <ImageOff className="h-5 w-5" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#D7A65A]/45 bg-[#1D2922] px-3.5 py-2 text-xs font-medium text-[#D7A65A] hover:bg-[#D7A65A]/10">
                  {uploadingImage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{uploadingImage ? 'Uploading to R2...' : 'Upload Image to R2'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={handleR2Upload}
                    className="hidden"
                  />
                </label>
                <select
                  value={form.imageKey || form.imageUrl || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setForm({ ...form, imageKey: null, imageUrl: '' });
                      return;
                    }
                    const found = mediaAssets.find((m) => m.r2Key === val || m.url === val);
                    if (found) {
                      setForm({ ...form, imageKey: found.r2Key, imageUrl: found.url });
                    }
                  }}
                  className="block w-full rounded-xl border border-[#2C3D34] bg-[#1D2922] px-3 py-2 text-xs text-[#F3EBDD]"
                >
                  <option value="">No image selected</option>
                  {mediaAssets.map((m) => (
                    <option key={m.id} value={m.r2Key}>
                      R2 Library: {m.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#F3EBDD]">
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm({ ...form, available: e.target.checked })}
                className="h-4 w-4 rounded accent-[#D7A65A]"
              />
              Available for ordering
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#F3EBDD]">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                className="h-4 w-4 rounded accent-[#D7A65A]"
              />
              Chef Featured Dish
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t border-[#2C3D34] pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-2 text-sm text-[#F3EBDD]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingImage}
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772] disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Dish'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Menu Item"
        message={`Permanently remove "${deleteTarget?.name}" from the live menu?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteItem(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
