/**
 * ZESTRO Admin real-time client.
 *
 * Connects to `GET /api/realtime` (WebSocket) on the Admin origin. Authentication is the
 * existing Cloudflare Access session (CF_Authorization cookie), verified server-side by the
 * Pages proxy + Admin Worker; the client never chooses which restaurant it subscribes to.
 *
 * Events are invalidation hints only — the dashboard refetches state through the existing
 * REST APIs. Reliability rules:
 *  - automatic connect, heartbeat and exponential-backoff reconnect;
 *  - every (re)connect `hello` with an unexpected sequence number triggers a resync;
 *  - a sequence gap triggers a resync;
 *  - duplicate events (same id or seq <= last seen) are dropped.
 */

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export type RealtimeEventType =
  | 'order.created'
  | 'order.updated'
  | 'waiter_call.created'
  | 'waiter_call.updated'
  | 'table.created'
  | 'table.updated'
  | 'table.deleted';

export interface RealtimeEvent {
  id: string;
  seq: number;
  at: string;
  type: RealtimeEventType;
  restaurantId: string;
  source: 'customer' | 'admin';
  data: Record<string, string | number | boolean | null>;
}

export type ResyncReason = 'connected' | 'reconnected' | 'gap';

interface MinimalWebSocket {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type WebSocketCtor = new (url: string) => MinimalWebSocket;

export interface RealtimeClientOptions {
  url: string;
  onEvent: (event: RealtimeEvent) => void;
  onResync: (reason: ResyncReason) => void;
  onStatus?: (status: RealtimeStatus) => void;
  WebSocketImpl?: WebSocketCtor;
  isOnline?: () => boolean;
  random?: () => number;
  now?: () => number;
  heartbeatMs?: number;
  staleAfterMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  offlineAfterFailures?: number;
}

const OPEN = 1;
const SEEN_ID_LIMIT = 500;

export function realtimeUrl(apiBase: string, loc: { protocol: string; host: string }): string {
  const base = apiBase.replace(/\/+$/, '');
  if (base) {
    const u = new URL(base + '/api/realtime');
    u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
    return u.toString();
  }
  return `${loc.protocol === 'http:' ? 'ws:' : 'wss:'}//${loc.host}/api/realtime`;
}

export class RealtimeClient {
  private readonly opts: Required<
    Omit<RealtimeClientOptions, 'onStatus' | 'WebSocketImpl'>
  > & Pick<RealtimeClientOptions, 'onStatus'> & { WebSocketImpl: WebSocketCtor };

  private ws: MinimalWebSocket | null = null;
  private stopped = true;
  private failures = 0;
  private everConnected = false;
  private lastSeq: number | null = null;
  private lastMessageAt = 0;
  private seenIds = new Set<string>();
  private seenOrder: string[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private status: RealtimeStatus = 'connecting';

  constructor(options: RealtimeClientOptions) {
    const WS =
      options.WebSocketImpl ??
      (typeof WebSocket !== 'undefined' ? (WebSocket as unknown as WebSocketCtor) : undefined);
    if (!WS) throw new Error('WebSocket is not available in this environment');
    this.opts = {
      url: options.url,
      onEvent: options.onEvent,
      onResync: options.onResync,
      onStatus: options.onStatus,
      WebSocketImpl: WS,
      isOnline:
        options.isOnline ??
        (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)),
      random: options.random ?? Math.random,
      now: options.now ?? Date.now,
      heartbeatMs: options.heartbeatMs ?? 25_000,
      staleAfterMs: options.staleAfterMs ?? 60_000,
      minBackoffMs: options.minBackoffMs ?? 1_000,
      maxBackoffMs: options.maxBackoffMs ?? 30_000,
      offlineAfterFailures: options.offlineAfterFailures ?? 5,
    };
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close(1000, 'client stopped');
      } catch {
        /* ignore */
      }
    }
  }

  /** Call when the browser reports it is back online: skip the remaining backoff. */
  notifyOnline(): void {
    if (this.stopped) return;
    if (this.ws && this.ws.readyState === OPEN) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.failures = 0;
    this.connect();
  }

  notifyOffline(): void {
    if (this.stopped) return;
    this.setStatus('offline');
  }

  private setStatus(next: RealtimeStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.opts.onStatus?.(next);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }

  private connect(): void {
    if (this.stopped) return;
    this.setStatus(
      !this.opts.isOnline()
        ? 'offline'
        : this.everConnected || this.failures > 0
        ? this.failures >= this.opts.offlineAfterFailures
          ? 'offline'
          : 'reconnecting'
        : 'connecting'
    );

    let ws: MinimalWebSocket;
    try {
      ws = new this.opts.WebSocketImpl(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.lastMessageAt = this.opts.now();

    ws.onmessage = (ev) => this.handleMessage(ws, ev.data);
    ws.onerror = () => {
      /* onclose follows and drives reconnection */
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.scheduleReconnect();
    };

    this.heartbeatTimer = setInterval(() => {
      if (this.ws !== ws) return;
      if (this.opts.now() - this.lastMessageAt > this.opts.staleAfterMs) {
        // Half-open connection: force a reconnect.
        try {
          ws.close(4000, 'stale');
        } catch {
          /* ignore */
        }
        ws.onclose?.({ code: 4000, reason: 'stale' });
        return;
      }
      if (ws.readyState === OPEN) {
        try {
          ws.send('ping');
        } catch {
          /* ignore */
        }
      }
    }, this.opts.heartbeatMs);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.failures += 1;
    this.setStatus(
      !this.opts.isOnline() || this.failures >= this.opts.offlineAfterFailures
        ? 'offline'
        : 'reconnecting'
    );
    const exp = Math.min(
      this.opts.maxBackoffMs,
      this.opts.minBackoffMs * 2 ** Math.min(this.failures - 1, 10)
    );
    const delay = Math.round(exp * (0.5 + this.opts.random() * 0.5));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private remember(id: string): boolean {
    if (this.seenIds.has(id)) return false;
    this.seenIds.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > SEEN_ID_LIMIT) {
      const old = this.seenOrder.shift();
      if (old) this.seenIds.delete(old);
    }
    return true;
  }

  private handleMessage(ws: MinimalWebSocket, raw: unknown): void {
    if (this.ws !== ws) return;
    this.lastMessageAt = this.opts.now();
    if (typeof raw !== 'string' || raw === 'pong') return;

    let msg: { type?: string; seq?: unknown; event?: RealtimeEvent };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      const serverSeq = typeof msg.seq === 'number' ? msg.seq : 0;
      const wasConnected = this.everConnected;
      const needsResync = this.lastSeq === null || serverSeq !== this.lastSeq;
      this.lastSeq = serverSeq;
      this.everConnected = true;
      this.failures = 0;
      this.setStatus('live');
      // Anything published while we were not connected is recovered from the REST APIs.
      if (needsResync || wasConnected) {
        this.opts.onResync(wasConnected ? 'reconnected' : 'connected');
      }
      return;
    }

    if (msg.type === 'event' && msg.event && typeof msg.event.seq === 'number') {
      const event = msg.event;
      if (typeof event.id !== 'string' || !this.remember(event.id)) return;
      if (this.lastSeq !== null && event.seq <= this.lastSeq) return;
      const gap = this.lastSeq !== null && event.seq > this.lastSeq + 1;
      this.lastSeq = event.seq;
      if (gap) this.opts.onResync('gap');
      this.opts.onEvent(event);
    }
  }
}
