interface Env {
  ADMIN_API_ORIGIN?: string;
}

function extractCfAccessToken(request: Request): string | null {
  const headerToken = request.headers.get('Cf-Access-Jwt-Assertion');
  if (headerToken && headerToken.trim()) {
    return headerToken.trim();
  }
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

  if (incoming.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const incomingOrigin = incoming.headers.get('Origin');
  if (
    incoming.method !== 'GET' &&
    incoming.method !== 'HEAD' &&
    incomingOrigin &&
    incomingOrigin !== incomingUrl.origin
  ) {
    return Response.json(
      { error: 'Forbidden cross-origin request.' },
      { status: 403, headers: { 'cache-control': 'no-store' } }
    );
  }

  const assertion = extractCfAccessToken(incoming);
  const authorization = incoming.headers.get('Authorization') || '';
  const hasSupabaseBearer = /^Bearer\\s+\\S+$/i.test(authorization);
  const isSupabaseLinkRequest = incomingUrl.pathname === '/api/auth/link-supabase';

  // First-time account linking requires the established Cloudflare Access identity.
  // Once linked, normal API requests can rely on Supabase JWT verification in the Worker.
  if (!assertion && (!hasSupabaseBearer || isSupabaseLinkRequest)) {
    return Response.json(
      { error: 'A valid Supabase session is required. First-time staff linking also requires your existing Cloudflare Access session.' },
      { status: 401, headers: { 'cache-control': 'no-store' } }
    );
  }

  const upstreamOrigin = (
    context.env.ADMIN_API_ORIGIN || 'https://zestro-admin-api.zestro-syl.workers.dev'
  ).replace(/\/+$/, '');
  const target = new URL(upstreamOrigin + incomingUrl.pathname + incomingUrl.search);

  const headers = new Headers(incoming.headers);
  headers.delete('host');
  headers.delete('cookie');
  headers.delete('origin');
  if (assertion) headers.set('Cf-Access-Jwt-Assertion', assertion);
  else headers.delete('Cf-Access-Jwt-Assertion');

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

    const isMediaBinary =
      incoming.method === 'GET' &&
      incomingUrl.pathname === '/api/media' &&
      incomingUrl.searchParams.has('key') &&
      upstream.ok;

    responseHeaders.set('cache-control', isMediaBinary ? 'private, max-age=300' : 'no-store');
    responseHeaders.set('x-content-type-options', 'nosniff');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('ZESTRO Pages API proxy upstream failure:', error);
    return Response.json(
      { error: 'Admin API upstream is temporarily unreachable. Please retry in a moment.' },
      { status: 502, headers: { 'cache-control': 'no-store' } }
    );
  }
};
