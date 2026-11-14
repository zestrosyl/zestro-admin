const configured = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_ZESTRO_ADMIN_API_URL;
export const ADMIN_API_BASE = (configured || 'https://zestro-admin-api.zestro-syl.workers.dev').replace(/\/+$/, '');

export async function adminApi<T = any>(path: string, method: string = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${ADMIN_API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.redirected) throw new Error('Admin API sign-in required. Open the protected API once and sign in with Cloudflare Access.');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API request failed (${response.status})`);
  return data as T;
}
