/**
 * ZESTRO real-time fan-out.
 *
 * One `RestaurantRealtime` Durable Object instance exists per restaurant
 * (`idFromName('restaurant:<id>')`). It holds the Admin Dashboard WebSocket
 * connections for that restaurant using the WebSocket Hibernation API and
 * broadcasts small, PII-free invalidation events after a D1 write succeeds.
 *
 * The object is only reachable through Worker bindings (the Admin Worker and
 * the Customer Worker); it has no public route. Callers are responsible for
 * authenticating admins and resolving the restaurant ID server-side before
 * they reach `/connect` or `/publish`.
 */

export type RealtimeEventType =
  | 'order.created'
  | 'order.updated'
  | 'waiter_call.created'
  | 'waiter_call.updated'
  | 'table.created'
  | 'table.updated'
  | 'table.deleted';

export const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = [
  'order.created',
  'order.updated',
  'waiter_call.created',
  'waiter_call.updated',
  'table.created',
  'table.updated',
  'table.deleted',
];

export type RealtimeSource = 'customer' | 'admin';

/** Event as submitted by a Worker after its D1 write succeeded. */
export interface RealtimePublishInput {
  type: RealtimeEventType;
  restaurantId: string;
  source: RealtimeSource;
  /** Small, non-personal identifiers only (ids, order number, table code, status). */
  data: Record<string, string | number | boolean | null>;
}

/** Event as delivered to Admin Dashboard clients. */
export interface RealtimeEvent extends RealtimePublishInput {
  id: string;
  seq: number;
  at: string;
}

interface SocketAttachment {
  restaurantId: string;
  memberId: string;
  /** Epoch ms after which the socket must re-authenticate (JWT expiry, capped). */
  expiresAt: number;
}

interface RealtimeEnv {
  REALTIME?: DurableObjectNamespace;
}

/** Hard cap on a single socket's lifetime so membership changes are re-checked regularly. */
export const MAX_SOCKET_LIFETIME_MS = 60 * 60 * 1000;

const ALLOWED_DATA_KEYS = new Set([
  'orderId',
  'orderNumber',
  'orderType',
  'status',
  'tableId',
  'tableCode',
  'callId',
  'requestType',
  'itemCount',
]);

/** Drop anything that is not an allow-listed, primitive, short value (defence against PII leaks). */
export function sanitizeEventData(
  data: Record<string, unknown> | undefined
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!data || typeof data !== 'object') return out;
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_DATA_KEYS.has(key)) continue;
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 120);
  }
  return out;
}

export function realtimeStubFor(
  namespace: DurableObjectNamespace,
  restaurantId: string
): DurableObjectStub {
  return namespace.get(namespace.idFromName(`restaurant:${restaurantId}`));
}

/**
 * Publish an event for `restaurantId`. Must only be called AFTER the D1 write
 * has resolved successfully. Never throws: real-time delivery is best-effort,
 * D1 stays the source of truth and clients resync on reconnect.
 */
export async function publishRealtimeEvent(
  env: RealtimeEnv,
  input: RealtimePublishInput
): Promise<void> {
  if (!env.REALTIME || !input.restaurantId) return;
  try {
    const stub = realtimeStubFor(env.REALTIME, input.restaurantId);
    const res = await stub.fetch('https://realtime.internal/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, data: sanitizeEventData(input.data) }),
    });
    if (!res.ok) {
      console.error('ZESTRO realtime publish rejected:', res.status, await res.text());
    }
  } catch (error) {
    console.error('ZESTRO realtime publish failed:', error);
  }
}

export class RestaurantRealtime {
  private readonly state: DurableObjectState;
  private seqCache: number | null = null;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    // Heartbeats are answered by the runtime without waking the object.
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private async currentSeq(): Promise<number> {
    if (this.seqCache === null) {
      this.seqCache = (await this.state.storage.get<number>('seq')) ?? 0;
    }
    return this.seqCache;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      return this.handleConnect(request);
    }
    if (url.pathname === '/publish' && request.method === 'POST') {
      return this.handlePublish(request);
    }
    return new Response('Not found', { status: 404 });
  }

  private async handleConnect(request: Request): Promise<Response> {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const restaurantId = (request.headers.get('X-Zestro-Restaurant-Id') || '').trim();
    const memberId = (request.headers.get('X-Zestro-Member-Id') || '').trim();
    const tokenExpMs = Number(request.headers.get('X-Zestro-Token-Exp') || 0) * 1000;
    if (!restaurantId || !memberId) {
      return new Response('Missing verified identity', { status: 400 });
    }

    const now = Date.now();
    const cap = now + MAX_SOCKET_LIFETIME_MS;
    const expiresAt = tokenExpMs > now ? Math.min(tokenExpMs, cap) : cap;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, [`restaurant:${restaurantId}`]);
    const attachment: SocketAttachment = { restaurantId, memberId, expiresAt };
    server.serializeAttachment(attachment);

    server.send(
      JSON.stringify({
        type: 'hello',
        seq: await this.currentSeq(),
        at: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
      })
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handlePublish(request: Request): Promise<Response> {
    let body: Partial<RealtimePublishInput>;
    try {
      body = (await request.json()) as Partial<RealtimePublishInput>;
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
    if (!body.type || !REALTIME_EVENT_TYPES.includes(body.type)) {
      return new Response('Unknown event type', { status: 400 });
    }
    const restaurantId = String(body.restaurantId || '').trim();
    if (!restaurantId) return new Response('Missing restaurantId', { status: 400 });

    const seq = (await this.currentSeq()) + 1;
    this.seqCache = seq;
    await this.state.storage.put('seq', seq);

    const event: RealtimeEvent = {
      id: crypto.randomUUID(),
      seq,
      at: new Date().toISOString(),
      type: body.type,
      restaurantId,
      source: body.source === 'admin' ? 'admin' : 'customer',
      data: sanitizeEventData(body.data as Record<string, unknown>),
    };
    const payload = JSON.stringify({ type: 'event', event });

    const now = Date.now();
    let delivered = 0;
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      // Defence in depth: never deliver across restaurants, even if routing were wrong.
      if (!att || att.restaurantId !== restaurantId) continue;
      if (att.expiresAt <= now) {
        try {
          ws.close(4401, 'Session expired; reconnect to re-authenticate');
        } catch {
          // already closing
        }
        continue;
      }
      try {
        ws.send(payload);
        delivered += 1;
      } catch {
        // Socket is going away; the runtime will call webSocketClose.
      }
    }

    return Response.json({ ok: true, seq, id: event.id, delivered });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Clients only send heartbeats (handled by the auto-response). Anything else is ignored;
    // clients can never publish events or change their subscription.
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      // 1005/1006/1015 are reserved and cannot be sent in a close frame.
      ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, reason);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // already closed
    }
  }
}
