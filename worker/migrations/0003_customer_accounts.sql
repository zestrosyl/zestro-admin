-- ZESTRO Migration 0003: Customer Accounts & Authenticated Sessions
-- Non-destructive additive migration for customer sign-up, sign-in, profile persistence, and order history.

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  default_address TEXT NOT NULL DEFAULT '',
  preferred_order_type TEXT NOT NULL DEFAULT 'delivery' CHECK (preferred_order_type IN ('dine_in', 'takeaway', 'delivery')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (restaurant_id, email)
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id, expires_at);

ALTER TABLE orders ADD COLUMN customer_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(restaurant_id, customer_id, created_at DESC);
