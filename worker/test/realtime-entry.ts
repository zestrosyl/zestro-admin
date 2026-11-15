// Test-only Worker entry: the real Admin handler with a local JWKS (no network) and the
// real RestaurantRealtime Durable Object class. Never deployed.
import { createLocalJWKSet } from 'jose';
import { createAdminHandler, RestaurantRealtime, type Env } from '../src/index';

export { RestaurantRealtime };

let handler: ReturnType<typeof createAdminHandler> | null = null;

export default {
  fetch(req: Request, env: Env & { TEST_JWKS: string }, ctx: ExecutionContext) {
    handler ??= createAdminHandler({
      keySetOverride: createLocalJWKSet(JSON.parse(env.TEST_JWKS)),
    });
    return handler.fetch(req, env, ctx);
  },
};
