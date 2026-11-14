import React, { useState } from 'react';
import { Upload, Eye, RefreshCw, Trash2, Copy } from 'lucide-react';
import { MediaAsset } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { dataService } from '../services/api';
import { optimizeImageUpload } from '../utils/imageUpload';

export const ImageLibraryModule: React.FC<{
  assets: MediaAsset[];
  onAddAsset: (asset: MediaAsset) => void;
  onReplaceAsset: (id: string, newUrl: string, sizeKb: number) => void;
  onDeleteAsset: (id: string) => void;
  onNotify: (msg: string) => void;
}> = ({ assets, onAddAsset, onReplaceAsset, onDeleteAsset, onNotify }) => {
  const [folderFilter, setFolderFilter] = useState<'all' | MediaAsset['folder']>('all');
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const image = await optimizeImageUpload(file);
      const asset: MediaAsset = {
        id: `img-${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        url: image.dataUrl,
        r2Key: dataService.buildR2Key('uploads', file.name),
        folder: 'dishes',
        dimensions: `${image.width} × ${image.height}`,
        sizeKb: image.sizeKb,
        uploadedAt: new Date().toISOString().slice(0, 10),
      };
      onAddAsset(asset);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not process this image.');
    } finally {
      e.target.value = '';
    }
  };

  const handleReplace = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const image = await optimizeImageUpload(file);
      onReplaceAsset(id, image.dataUrl, image.sizeKb);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not process this image.');
    } finally {
      e.target.value = '';
    }
  };

  const filtered = assets.filter((a) => folderFilter === 'all' || a.folder === folderFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="w-full text-xs text-[#F3EBDD]/55">Demo uploads are compressed and kept in this browser. They are not uploaded to Cloudflare R2 yet.</p>
        <div className="flex flex-wrap gap-2">
          {(['all', 'dishes', 'ambiance', 'banners', 'gallery'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFolderFilter(f)}
              className={`rounded-xl px-3.5 py-2 text-xs font-medium capitalize transition ${
                folderFilter === f
                  ? 'bg-[#D7A65A] text-[#101B17]'
                  : 'border border-[#2C3D34] bg-[#1D2922] text-[#F3EBDD]/75 hover:text-[#F3EBDD]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] transition hover:bg-[#e3b772]">
          <Upload className="h-4 w-4" />
          <span>Upload Image</span>
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((asset) => (
          <div
            key={asset.id}
            className="overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922] transition hover:border-[#D7A65A]/45"
          >
            <div className="relative h-44 bg-[#101B17]">
              <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" />
              <div className="absolute right-3 top-3">
                <Badge variant="gold">{asset.folder}</Badge>
              </div>
            </div>
            <div className="p-4">
              <p className="truncate font-medium text-[#F3EBDD]">{asset.title}</p>
              <p className="mt-1 truncate text-[11px] text-[#F3EBDD]/55">
                {asset.dimensions} • {asset.sizeKb} KB
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-[#2C3D34] pt-3">
                <button
                  type="button"
                  onClick={() => setPreviewAsset(asset)}
                  className="flex items-center gap-1 text-xs font-medium text-[#D7A65A] hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(asset.r2Key).catch(() => {});
                      onNotify(`Copied R2 key: ${asset.r2Key}`);
                    }}
                    className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/75 hover:text-[#D7A65A]"
                    title="Copy R2 Key"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <label
                    className="cursor-pointer rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/75 hover:text-[#D7A65A]"
                    title="Replace image"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleReplace(asset.id, e)}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(asset)}
                    className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-rose-300/80 hover:text-rose-300"
                    title="Delete image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={Boolean(previewAsset)}
        onClose={() => setPreviewAsset(null)}
        title={previewAsset?.title ?? 'Image Preview'}
        subtitle={previewAsset ? `R2 Key: ${previewAsset.r2Key}` : undefined}
        maxWidth="max-w-2xl"
      >
        {previewAsset && (
          <div className="space-y-4">
            <img
              src={previewAsset.url}
              alt={previewAsset.title}
              className="max-h-[60vh] w-full rounded-xl object-contain bg-[#101B17]"
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-[#F3EBDD]/65">
              <span>Dimensions: {previewAsset.dimensions}</span>
              <span>Size: {previewAsset.sizeKb} KB</span>
              <span>Uploaded: {previewAsset.uploadedAt}</span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Media Asset"
        message={`Delete "${deleteTarget?.title}" from the Image Library?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteAsset(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
