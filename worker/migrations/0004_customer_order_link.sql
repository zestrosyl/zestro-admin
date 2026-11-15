-- Optional order ownership link. Apply only after the base orders table exists.
ALTER TABLE orders ADD COLUMN customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(restaurant_id,customer_id,created_at DESC);
