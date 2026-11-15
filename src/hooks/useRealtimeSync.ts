import { useEffect, useRef, useState } from 'react';
import { ADMIN_API_BASE } from '../services/liveApi';
import {
  RealtimeClient,
  realtimeUrl,
  type RealtimeEvent,
  type RealtimeStatus,
} from '../services/realtime';

export type RealtimeResource = 'orders' | 'waiter-calls' | 'tables' | 'activities';

/** Map a real-time event to the dashboard resources that must be refetched. */
export function resourcesForEvent(event: RealtimeEvent): RealtimeResource[] {
  const out = new Set<RealtimeResource>();
  if (event.type.startsWith('order.')) {
    out.add('orders');
    // Orders can move a table to "occupied"; refresh tables when one is involved.
    if (event.data?.tableId) out.add('tables');
  } else if (event.type.startsWith('waiter_call.')) {
    out.add('waiter-calls');
  } else if (event.type.startsWith('table.')) {
    out.add('tables');
  }
  // Admin-originated writes also produce activity-log rows.
  if (event.source === 'admin') out.add('activities');
  return [...out];
}

const ALL_RESOURCES: RealtimeResource[] = ['orders', 'waiter-calls', 'tables', 'activities'];
const DEBOUNCE_MS = 250;
const FALLBACK_POLL_MS = 20_000;

/**
 * Keeps operational queues fresh without manual refresh:
 *  - WebSocket events invalidate + refetch only the affected resources (debounced, coalesced);
 *  - reconnects and sequence gaps trigger a single full operational resync;
 *  - the previous 20s polling remains ONLY as a fallback while the live channel is down.
 */
export function useRealtimeSync(
  enabled: boolean,
  refetch: (resources: RealtimeResource[]) => Promise<void> | void
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // Debounced, coalesced invalidation queue.
  const pending = useRef(new Set<RealtimeResource>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      timer.current = null;
      const list = [...pending.current];
      pending.current.clear();
      if (list.length) void refetchRef.current(list);
    };
    const invalidate = (resources: RealtimeResource[]) => {
      resources.forEach((r) => pending.current.add(r));
      if (!timer.current) timer.current = setTimeout(flush, DEBOUNCE_MS);
    };

    if (typeof WebSocket === 'undefined') {
      setStatus('offline');
      return;
    }

    const client = new RealtimeClient({
      url: realtimeUrl(ADMIN_API_BASE, window.location),
      onEvent: (event) => invalidate(resourcesForEvent(event)),
      onResync: () => invalidate(ALL_RESOURCES),
      onStatus: setStatus,
    });

    const onOnline = () => client.notifyOnline();
    const onOffline = () => client.notifyOffline();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    client.start();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      client.stop();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current.clear();
    };
  }, [enabled]);

  // Safe fallback: poll only while NOT live and the tab is visible.
  useEffect(() => {
    if (!enabled || status === 'live' || status === 'connecting') return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refetchRef.current(ALL_RESOURCES);
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, status]);

  return status;
}
