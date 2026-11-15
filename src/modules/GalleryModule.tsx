import React, { useState } from 'react';
import { Upload, ArrowLeft, ArrowRight, Trash2, Star, Plus, Pencil, ImageOff, Loader2 } from 'lucide-react';
import { GalleryPhoto, MediaAsset } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { uploadMediaToR2 } from '../services/liveApi';

export const GalleryModule: React.FC<{
  photos: GalleryPhoto[];
  mediaAssets: MediaAsset[];
  canManage?: boolean;
  onAssetUploaded: (asset: MediaAsset) => void;
  onSavePhoto: (photo: GalleryPhoto, isNew: boolean) => Promise<boolean> | void;
  onMovePhoto: (id: string, dir: 'prev' | 'next') => void;
  onDeletePhoto: (id: string) => void;
  onNotify: (msg: string, tone?: 'success' | 'info' | 'warning') => void;
}> = ({
  photos,
  mediaAssets,
  canManage = true,
  onAssetUploaded,
  onSavePhoto,
  onMovePhoto,
  onDeletePhoto,
  onNotify,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GalleryPhoto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GalleryPhoto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    caption: string;
    category: GalleryPhoto['category'];
    imageKey: string | null;
    imageUrl: string;
    featured: boolean;
  }>({
    title: '',
    caption: '',
    category: 'Dining Room',
    imageKey: null,
    imageUrl: '',
    featured: false,
  });

  const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);

  const openNew = () => {
    setEditing(null);
    setForm({
      title: '',
      caption: '',
      category: 'Dining Room',
      imageKey: mediaAssets[0]?.r2Key ?? null,
      imageUrl: mediaAssets[0]?.url ?? '',
      featured: false,
    });
    setModalOpen(true);
  };

  const openEdit = (photo: GalleryPhoto) => {
    setEditing(photo);
    setForm({
      title: photo.title,
      caption: photo.caption,
      category: photo.category,
      imageKey: photo.imageKey ?? null,
      imageUrl: photo.imageUrl,
      featured: photo.featured,
    });
    setModalOpen(true);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadMediaToR2(file, 'gallery', form.title.trim() || undefined);
      onAssetUploaded(asset);
      setForm((current) => ({ ...current, imageKey: asset.r2Key, imageUrl: asset.url }));
      onNotify(`Uploaded "${asset.title}" to Cloudflare R2`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not upload gallery photo.', 'warning');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    if (!form.imageUrl && !form.imageKey) {
      onNotify('Please upload or choose an R2 image for this gallery item.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const ok = await onSavePhoto(
        {
          id: editing ? editing.id : `gal-${Date.now()}`,
          title: form.title.trim(),
          caption: form.caption.trim(),
          category: form.category,
          imageKey: form.imageKey,
          imageUrl: form.imageUrl,
          sortOrder: editing ? editing.sortOrder : photos.length + 1,
          featured: form.featured,
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
          Curate and arrange restaurant photography shown in the live customer website gallery.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
          >
            <Plus className="h-4 w-4" /> Add Gallery Photo
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-10 text-center">
          <p className="font-serif text-lg font-semibold text-[#F3EBDD]">No gallery photos published yet</p>
          <p className="mt-1 text-xs text-[#F3EBDD]/60">
            Upload dining room, culinary, and lounge photography to feature on your public website.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((photo, idx) => (
            <div
              key={photo.id}
              className="overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922] transition hover:border-[#D7A65A]/45"
            >
              <div className="relative h-52 bg-[#101B17]">
                {photo.imageUrl ? (
                  <img src={photo.imageUrl} alt={photo.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#F3EBDD]/30">
                    <ImageOff className="h-8 w-8" />
                  </div>
                )}
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <Badge variant="neutral">#{idx + 1}</Badge>
                  <Badge variant="gold">{photo.category}</Badge>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void onSavePhoto({ ...photo, featured: !photo.featured }, false)}
                    className={`absolute right-3 top-3 rounded-lg p-1.5 backdrop-blur-sm ${
                      photo.featured ? 'bg-[#D7A65A] text-[#101B17]' : 'bg-black/50 text-[#F3EBDD]/70'
                    }`}
                    title="Toggle featured"
                  >
                    <Star className={`h-4 w-4 ${photo.featured ? 'fill-current' : ''}`} />
                  </button>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-serif text-base font-semibold text-[#F3EBDD]">{photo.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-[#F3EBDD]/65">{photo.caption}</p>
                {canManage && (
                  <div className="mt-4 flex items-center justify-between border-t border-[#2C3D34] pt-3">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => onMovePhoto(photo.id, 'prev')}
                        className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/75 disabled:opacity-30"
                        title="Move earlier"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === sorted.length - 1}
                        onClick={() => onMovePhoto(photo.id, 'next')}
                        className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/75 disabled:opacity-30"
                        title="Move later"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(photo)}
                        className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/80 hover:text-[#D7A65A]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(photo)}
                        className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-rose-300/80 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
        title={editing ? 'Edit Gallery Photo' : 'Add Gallery Photo'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Photo Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              placeholder="e.g. Chef Counter Evening Service"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Category</label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as GalleryPhoto['category'] })
              }
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            >
              <option value="Dining Room">Dining Room</option>
              <option value="Culinary">Culinary</option>
              <option value="Private Events">Private Events</option>
              <option value="Bar & Lounge">Bar &amp; Lounge</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Caption</label>
            <textarea
              rows={2}
              value={form.caption}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
          <div className="space-y-2 rounded-xl border border-[#2C3D34] bg-[#101B17] p-3">
            <div className="flex items-center gap-4">
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="Preview" className="h-16 w-20 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-20 items-center justify-center rounded-lg border border-[#2C3D34] bg-[#1D2922] text-[#F3EBDD]/35">
                  <ImageOff className="h-5 w-5" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#D7A65A]/45 bg-[#1D2922] px-3.5 py-2 text-xs font-medium text-[#D7A65A]">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{uploading ? 'Uploading to R2...' : 'Upload to R2'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={handleFile}
                    className="hidden"
                  />
                </label>
                {mediaAssets.length > 0 && (
                  <select
                    value={form.imageKey || ''}
                    onChange={(e) => {
                      const found = mediaAssets.find((m) => m.r2Key === e.target.value);
                      if (found) setForm({ ...form, imageKey: found.r2Key, imageUrl: found.url });
                    }}
                    className="block w-full rounded-xl border border-[#2C3D34] bg-[#1D2922] px-3 py-2 text-xs text-[#F3EBDD]"
                  >
                    <option value="">Choose from R2 Image Library...</option>
                    {mediaAssets.map((m) => (
                      <option key={m.id} value={m.r2Key}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#F3EBDD]">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              className="h-4 w-4 accent-[#D7A65A]"
            />
            Featured highlight photo
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
              disabled={saving || uploading}
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17] disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add to Gallery'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove Photo"
        message={`Remove "${deleteTarget?.title}" from the restaurant gallery?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeletePhoto(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
