-- Additive Supabase identity link for existing staff memberships.
-- Existing Cloudflare Access auth_subject values and rows are preserved.
ALTER TABLE memberships ADD COLUMN supabase_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_memberships_supabase_user_id
  ON memberships(supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_restaurant_supabase_user
  ON memberships(restaurant_id, supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;
