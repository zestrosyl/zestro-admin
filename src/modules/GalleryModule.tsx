import React, { useState } from 'react';
import { Upload, ArrowLeft, ArrowRight, Trash2, Star, Plus } from 'lucide-react';
import { GalleryPhoto } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { optimizeImageUpload } from '../utils/imageUpload';

export const GalleryModule: React.FC<{
  photos: GalleryPhoto[];
  onSavePhoto: (photo: GalleryPhoto, isNew: boolean) => void;
  onMovePhoto: (id: string, dir: 'prev' | 'next') => void;
  onDeletePhoto: (id: string) => void;
}> = ({ photos, onSavePhoto, onMovePhoto, onDeletePhoto }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GalleryPhoto | null>(null);
  const [form, setForm] = useState<{
    title: string;
    caption: string;
    category: GalleryPhoto['category'];
    imageUrl: string;
    featured: boolean;
  }>({
    title: '',
    caption: '',
    category: 'Dining Room',
    imageUrl: '/images/hero-interior.jpg',
    featured: false,
  });

  const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (!form.title.trim()) return;
    onSavePhoto(
      {
        id: `gal-${Date.now()}`,
        title: form.title.trim(),
        caption: form.caption.trim(),
        category: form.category,
        imageUrl: form.imageUrl,
        sortOrder: photos.length + 1,
        featured: form.featured,
      },
      true
    );
    setModalOpen(false);
    setForm({
      title: '',
      caption: '',
      category: 'Dining Room',
      imageUrl: '/images/hero-interior.jpg',
      featured: false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#F3EBDD]/70">
          Curate and arrange restaurant photography shown in the public gallery.
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
        >
          <Plus className="h-4 w-4" /> Add Gallery Photo
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((photo, idx) => (
          <div
            key={photo.id}
            className="overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922] transition hover:border-[#D7A65A]/45"
          >
            <div className="relative h-52 bg-[#101B17]">
              <img src={photo.imageUrl} alt={photo.title} className="h-full w-full object-cover" />
              <div className="absolute left-3 top-3 flex gap-1.5">
                <Badge variant="neutral">#{idx + 1}</Badge>
                <Badge variant="gold">{photo.category}</Badge>
              </div>
              <button
                type="button"
                onClick={() => onSavePhoto({ ...photo, featured: !photo.featured }, false)}
                className={`absolute right-3 top-3 rounded-lg p-1.5 backdrop-blur-sm ${
                  photo.featured ? 'bg-[#D7A65A] text-[#101B17]' : 'bg-black/50 text-[#F3EBDD]/70'
                }`}
                title="Toggle featured"
              >
                <Star className={`h-4 w-4 ${photo.featured ? 'fill-current' : ''}`} />
              </button>
            </div>
            <div className="p-4">
              <h3 className="font-serif text-base font-semibold text-[#F3EBDD]">{photo.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-[#F3EBDD]/65">{photo.caption}</p>
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
                <button
                  type="button"
                  onClick={() => setDeleteTarget(photo)}
                  className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-rose-300/80 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Gallery Photo">
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
              onChange={(e) => setForm({ ...form, category: e.target.value as GalleryPhoto['category'] })}
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
          <div className="flex items-center gap-4 rounded-xl border border-[#2C3D34] bg-[#101B17] p-3">
            <img src={form.imageUrl} alt="Preview" className="h-16 w-20 rounded-lg object-cover" />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#D7A65A]/45 bg-[#1D2922] px-3.5 py-2 text-xs font-medium text-[#D7A65A]">
              <Upload className="h-3.5 w-3.5" />
              <span>Choose Photo</span>
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
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
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17]"
            >
              Add to Gallery
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
