# Migration 0003 — authentication schema

- This migration is additive and leaves existing `restaurants` and `memberships` rows unchanged.
- The table names and columns are the Better Auth D1 adapter's conventional schema. Before treating this SQL as deployable, regenerate or compare the schema with the exact Better Auth version selected in the Worker lockfile and the adapter's generated schema.
- The migration includes ZESTRO's invitation-token storage. Tokens must be high entropy and only the SHA-256 digest belongs in `token_hash`.
- This migration is not applied to any remote database by this repository change.
- The schema is still under implementation review and is not a production migration approval.
