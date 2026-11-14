import React, { useState } from 'react';
import { Upload, Eye, RefreshCw, Trash2, Copy, Loader2 } from 'lucide-react';
import { MediaAsset } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { replaceMediaInR2, uploadMediaToR2 } from '../services/liveApi';

export const ImageLibraryModule: React.FC<{
  assets: MediaAsset[];
  canManage?: boolean;
  onAddAsset: (asset: MediaAsset) => void;
  onReplaceAsset: (asset: MediaAsset) => void;
  onDeleteAsset: (id: string) => void;
  onNotify: (msg: string, tone?: 'success' | 'info' | 'warning') => void;
}> = ({ assets, canManage = true, onAddAsset, onReplaceAsset, onDeleteAsset, onNotify }) => {
  const [folderFilter, setFolderFilter] = useState<'all' | MediaAsset['folder']>('all');
  const [uploadFolder, setUploadFolder] = useState<MediaAsset['folder']>('dishes');
  const [uploading, setUploading] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const targetFolder = folderFilter === 'all' ? uploadFolder : folderFilter;
      const asset = await uploadMediaToR2(file, targetFolder);
      onAddAsset(asset);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not upload image to R2.', 'warning');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleReplace = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReplacingId(id);
    try {
      const updated = await replaceMediaInR2(id, file);
      onReplaceAsset({ ...updated, url: `${updated.url}&v=${Date.now()}` });
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not replace image in R2.', 'warning');
    } finally {
      setReplacingId(null);
      e.target.value = '';
    }
  };

  const filtered = assets.filter((a) => folderFilter === 'all' || a.folder === folderFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="w-full text-xs text-[#F3EBDD]/60">
          Images are compressed and uploaded directly to your Cloudflare R2 bucket and D1 media catalog.
        </p>
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

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {folderFilter === 'all' && (
              <select
                value={uploadFolder}
                onChange={(e) => setUploadFolder(e.target.value as MediaAsset['folder'])}
                className="rounded-xl border border-[#2C3D34] bg-[#1D2922] px-3 py-2.5 text-xs text-[#F3EBDD]"
                aria-label="Target folder"
              >
                <option value="dishes">Folder: Dishes</option>
                <option value="ambiance">Folder: Ambiance</option>
                <option value="banners">Folder: Banners</option>
                <option value="gallery">Folder: Gallery</option>
              </select>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] transition hover:bg-[#e3b772]">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-10 text-center">
          <p className="font-serif text-lg font-semibold text-[#F3EBDD]">No media assets in R2 yet</p>
          <p className="mt-1 text-xs text-[#F3EBDD]/60">
            Upload dish, banner, or gallery photography to store it in your restaurant R2 bucket.
          </p>
        </div>
      ) : (
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
                        onNotify(`Copied R2 key: ${asset.r2Key}`, 'info');
                      }}
                      className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/75 hover:text-[#D7A65A]"
                      title="Copy R2 Key"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {canManage && (
                      <>
                        <label
                          className="cursor-pointer rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/75 hover:text-[#D7A65A]"
                          title="Replace image in R2"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${replacingId === asset.id ? 'animate-spin' : ''}`}
                          />
                          <input
                            type="file"
                            accept="image/*"
                            disabled={replacingId === asset.id}
                            onChange={(e) => handleReplace(asset.id, e)}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(asset)}
                          className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-rose-300/80 hover:text-rose-300"
                          title="Delete image from R2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
              className="max-h-[60vh] w-full rounded-xl bg-[#101B17] object-contain"
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
        message={`Permanently delete "${deleteTarget?.title}" from Cloudflare R2 and the Image Library?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteAsset(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
