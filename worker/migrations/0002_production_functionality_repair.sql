-- Additive, non-destructive migration bringing existing production D1 schema
-- into full alignment with Admin Dashboard and Customer Website persistence.
-- Safe on existing data: no DROP TABLE, no DELETE, no UPDATE overwriting user rows.

ALTER TABLE menu_categories ADD COLUMN category_type TEXT NOT NULL DEFAULT 'food' CHECK (category_type IN ('food', 'beverage'));

ALTER TABLE menu_items ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE menu_items ADD COLUMN options_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE menu_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE promotions ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE promotions ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE memberships ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE memberships ADD COLUMN shift TEXT NOT NULL DEFAULT '';
ALTER TABLE memberships ADD COLUMN job_title TEXT NOT NULL DEFAULT '';
ALTER TABLE memberships ADD COLUMN duty_status TEXT NOT NULL DEFAULT 'Active' CHECK (duty_status IN ('Active', 'On Shift', 'Off Duty'));

ALTER TABLE media_assets ADD COLUMN dimensions TEXT NOT NULL DEFAULT '';
ALTER TABLE media_assets ADD COLUMN updated_at TEXT;

ALTER TABLE orders ADD COLUMN customer_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN delivery_address TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN delivery_fee_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN promo_code TEXT;
ALTER TABLE orders ADD COLUMN staff_note TEXT NOT NULL DEFAULT '';

ALTER TABLE order_items ADD COLUMN options_snapshot_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS gallery_photos (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Dining Room' CHECK (category IN ('Dining Room', 'Culinary', 'Private Events', 'Bar & Lounge')),
  image_key TEXT,
  image_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memberships_email ON memberships(restaurant_id, email);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant_sort ON menu_categories(restaurant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item ON order_items(restaurant_id, menu_item_id);
CREATE INDEX IF NOT EXISTS idx_promotions_restaurant_active ON promotions(restaurant_id, active);
CREATE INDEX IF NOT EXISTS idx_media_assets_restaurant_created ON media_assets(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_restaurant_sort ON gallery_photos(restaurant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant_created ON audit_logs(restaurant_id, created_at DESC);
