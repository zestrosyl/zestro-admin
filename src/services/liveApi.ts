export const ADMIN_API_BASE = '';

export async function adminApi<T = any>(path: string, method: string = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${ADMIN_API_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API request failed (${response.status})`);
  return data as T;
}
