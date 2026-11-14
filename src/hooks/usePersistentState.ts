import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Browser persistence for the demo workspace.
 * This intentionally remains a client-side adapter: production data must move to
 * the authenticated Cloudflare Worker + D1 API, not rely on localStorage.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const stored = window.localStorage.getItem(`zestro-admin:${key}`);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(`zestro-admin:${key}`, JSON.stringify(value));
    } catch (error) {
      // Large local image uploads can exceed browser storage quotas.
      console.warn(`ZESTRO local demo data could not be saved for "${key}".`, error);
    }
  }, [key, value]);

  return [value, setValue];
}
