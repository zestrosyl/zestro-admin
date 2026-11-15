interface Env { ADMIN_API_ORIGIN?: string; }

const ALLOWED_AUTH_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-out',
  '/api/auth/get-session',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
]);

function getBetterAuthCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const allowed = cookieHeader.split(';').map((part) => part.trim()).filter((part) => {
    const name = part.split('=', 1)[0].trim();
    return /^(?:__Secure-|__Host-)?better-auth\.(?:session_token|session_data|dont_remember)$/i.test(name);
  });
  return allowed.length ? allowed.join('; ') : null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const incoming = context.request;
  const incomingUrl = new URL(incoming.url);
  const path = incomingUrl.pathname;

  if (incoming.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  // This route only proxies /api/*. The Worker independently protects every
  // business endpoint using the Better Auth session + active tenant membership.
  if (!path.startsWith('/api/')) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const origin = incoming.headers.get('Origin');
  if (origin && origin !== incomingUrl.origin) {
    return Response.json(
      { error: 'Forbidden cross-origin request.' },
      { status: 403, headers: { 'cache-control': 'no-store' } }
    );
  }

  const isAuthRoute = ALLOWED_AUTH_PATHS.has(path);
  if (path.startsWith('/api/auth/') && !isAuthRoute) {
    return Response.json(
      { error: 'Authentication route not available.' },
      { status: 404, headers: { 'cache-control': 'no-store' } }
    );
  }

  const upstreamOrigin = (
    context.env.ADMIN_API_ORIGIN || 'https://zestro-admin-api.zestro-syl.workers.dev'
  ).replace(/\/+$/, '');
  const target = new URL(upstreamOrigin + incomingUrl.pathname + incomingUrl.search);

  const headers = new Headers(incoming.headers);
  headers.delete('host');
  headers.delete('cookie');
  headers.delete('Cf-Access-Jwt-Assertion');
  headers.delete('cf-access-jwt-assertion');
  // Keep Origin so Better Auth can enforce trustedOrigins and Worker CORS can
  // apply its exact allowlist. The same-origin check above runs before proxying.
  if (origin) headers.set('Origin', origin);

  const sessionCookie = getBetterAuthCookie(incoming);
  if (sessionCookie) headers.set('Cookie', sessionCookie);

  const init: RequestInit = {
    method: incoming.method,
    headers,
    redirect: 'manual',
  };
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
    init.body = await incoming.arrayBuffer();
  }

  try {
    const upstream = await fetch(target.toString(), init);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('access-control-allow-origin');
    responseHeaders.delete('access-control-allow-credentials');
    responseHeaders.set('cache-control', 'no-store');
    responseHeaders.set('x-content-type-options', 'nosniff');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('ZESTRO Pages API proxy upstream failure:', error);
    return Response.json(
      { error: 'Admin API upstream is temporarily unreachable. Please retry.' },
      { status: 502, headers: { 'cache-control': 'no-store' } }
    );
  }
};
