# Migration 0003 — authentication schema

**Status: NOT VERIFIED / NOT APPLY-READY.**

- This is a proposed additive Better Auth and ZESTRO invitation schema only.
- The migration has not been generated from the exact Better Auth version resolved by the Worker lockfile. It must not be applied until the lockfile is regenerated and the schema is compared with Better Auth's official D1 schema output.
- Existing restaurants and memberships rows are intended to remain untouched.
- auth_invitation_tokens stores only high-entropy token digests, never raw invitation secrets.
- auth_owner_link_proofs requires a separate operator workflow; no public method may create these proofs.
- Never run this migration against the production database during the implementation phase.
- Apply only to a separate staging D1 database after schema generation and failure-path tests.
