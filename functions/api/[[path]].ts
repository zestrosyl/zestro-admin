interface Env { ADMIN_API_ORIGIN?: string; }

const PUBLIC_AUTH_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-out',
  '/api/auth/get-session',
  '/api/auth/forget-password',
  '/api/auth/reset-password',
]);

function extractCfAccessToken(request: Request): string | null {
  const headerToken = request.headers.get('Cf-Access-Jwt-Assertion');
  if (headerToken?.trim()) return headerToken.trim();
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === 'CF_Authorization' && rest.length > 0) {
      const value = rest.join('=').trim();
      if (value) return value;
    }
  }
  return null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const incoming = context.request;
  const incomingUrl = new URL(incoming.url);
  const path = incomingUrl.pathname;
  if (incoming.method === 'OPTIONS') return new Response(null, { status: 204 });

  const incomingOrigin = incoming.headers.get('Origin');
  if (incomingOrigin && incomingOrigin !== incomingUrl.origin) {
    return Response.json(
      { error: 'Forbidden cross-origin request.' },
      { status: 403, headers: { 'cache-control': 'no-store' } }
    );
  }

  const isAuthRoute = PUBLIC_AUTH_PATHS.has(path);
  const assertion = isAuthRoute ? null : extractCfAccessToken(incoming);
  if (!isAuthRoute && !assertion) {
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401, headers: { 'cache-control': 'no-store' } }
    );
  }

  const upstreamOrigin = (
    context.env.ADMIN_API_ORIGIN || 'https://zestro-admin-api.zestro-syl.workers.dev'
  ).replace(/\/+$/, '');
  const target = new URL(upstreamOrigin + incomingUrl.pathname + incomingUrl.search);
  const headers = new Headers(incoming.headers);
  headers.delete('host');
  headers.delete('origin');

  if (isAuthRoute) {
    // Public auth methods may carry Better Auth cookies, but never forward
    // Cloudflare Access credentials as proof of the Better Auth identity.
    headers.delete('Cf-Access-Jwt-Assertion');
    headers.delete('cf-access-jwt-assertion');
  } else {
    headers.delete('cookie');
    headers.set('Cf-Access-Jwt-Assertion', assertion!);
  }

  const init: RequestInit = { method: incoming.method, headers, redirect: 'manual' };
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
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error('ZESTRO Pages API proxy upstream failure:', error);
    return Response.json(
      { error: 'Admin API upstream is temporarily unreachable. Please retry.' },
      { status: 502, headers: { 'cache-control': 'no-store' } }
    );
  }
};
