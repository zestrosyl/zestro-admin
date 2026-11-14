import { useCallback, useEffect } from 'react';
import { usePersistentState } from './usePersistentState';

export type Theme = 'light' | 'dark';

/**
 * Light-first theme preference. Only the preference is stored (in this browser);
 * it never touches business data. The attribute is also set by a small script in
 * index.html before first paint.
 */
export function useTheme(): [Theme, () => void] {
  const [stored, setStored] = usePersistentState<Theme>('theme', 'light');
  const theme: Theme = stored === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#0b1411' : '#f6f5f1');
  }, [theme]);

  const toggle = useCallback(() => setStored(theme === 'dark' ? 'light' : 'dark'), [theme, setStored]);
  return [theme, toggle];
}
