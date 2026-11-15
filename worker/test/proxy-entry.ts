// Test-only Worker entry that runs the Admin Pages Function `/api/*` proxy. Never deployed.
import { onRequest } from '../../functions/api/[[path]]';

export default {
  fetch(request: Request, env: Record<string, string>, ctx: ExecutionContext) {
    return (onRequest as unknown as (c: unknown) => Promise<Response>)({
      request,
      env,
      params: {},
      data: {},
      waitUntil: ctx.waitUntil.bind(ctx),
      passThroughOnException() {},
      next: () => Promise.resolve(new Response('next', { status: 404 })),
      functionPath: '/api/[[path]]',
    });
  },
};
