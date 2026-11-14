interface Env {}
export const onRequest: PagesFunction<Env> = async (context) => {
  const incoming = context.request;
  const assertion = incoming.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) {
    return Response.json({ error: 'Admin sign-in required. Sign in to the ZESTRO Admin site and refresh.' }, { status: 401 });
  }
  const incomingUrl = new URL(incoming.url);
  const target = new URL('https://zestro-admin-api.zestro-syl.workers.dev' + incomingUrl.pathname + incomingUrl.search);
  const headers = new Headers(incoming.headers);
  headers.delete('host');
  headers.delete('cookie');
  headers.set('Cf-Access-Jwt-Assertion', assertion);
  headers.delete('origin');
  const init: RequestInit = {
    method: incoming.method,
    headers,
    redirect: 'manual',
  };
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') init.body = await incoming.arrayBuffer();
  const upstream = await fetch(target.toString(), init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('access-control-allow-origin');
  responseHeaders.delete('access-control-allow-credentials');
  responseHeaders.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
};
