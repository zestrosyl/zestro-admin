import type { MediaAsset } from '../types';
import { optimizeImageUpload } from '../utils/imageUpload';

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
export const ADMIN_API_BASE = (viteEnv?.VITE_ADMIN_API_BASE || '').replace(/\/+$/, '');

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

export async function adminApi<T = unknown>(
  path: string,
  method: string = 'GET',
  body?: unknown
): Promise<T> {
  const response = await fetch(`${ADMIN_API_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new AdminApiError(
      String((data as { error?: string }).error || `API request failed (${response.status})`),
      response.status
    );
  }
  return data as T;
}

export async function uploadMediaToR2(
  file: File,
  folder: MediaAsset['folder'] = 'dishes',
  titleOverride?: string,
  maxEdge = 1600
): Promise<MediaAsset> {
  const optimized = await optimizeImageUpload(file, maxEdge);
  const title = (titleOverride || file.name.replace(/\.[^.]+$/, '') || 'Uploaded Image').trim();

  const response = await fetch(`${ADMIN_API_BASE}/api/media`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': optimized.mimeType,
      'x-file-name': encodeURIComponent(file.name),
      'x-title': encodeURIComponent(title),
      'x-folder': folder,
      'x-dimensions': `${optimized.width} × ${optimized.height}`,
    },
    body: optimized.blob,
  });

  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new AdminApiError(
      String((data as { error?: string }).error || `Image upload failed (${response.status})`),
      response.status
    );
  }

  return data as MediaAsset;
}

export async function replaceMediaInR2(assetId: string, file: File): Promise<MediaAsset> {
  const optimized = await optimizeImageUpload(file, 1600);
  const response = await fetch(`${ADMIN_API_BASE}/api/media/${encodeURIComponent(assetId)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {
      'Content-Type': optimized.mimeType,
      'x-dimensions': `${optimized.width} × ${optimized.height}`,
    },
    body: optimized.blob,
  });

  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new AdminApiError(
      String((data as { error?: string }).error || `Image replacement failed (${response.status})`),
      response.status
    );
  }

  return data as MediaAsset;
}
