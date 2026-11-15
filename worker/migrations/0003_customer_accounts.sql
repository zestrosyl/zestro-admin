-- Additive customer account schema. Existing guest orders remain valid.
CREATE TABLE IF NOT EXISTS customers (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 email TEXT NOT NULL,
 name TEXT NOT NULL,
 phone TEXT,
 default_address TEXT,
 password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(restaurant_id,email),
 UNIQUE(id,restaurant_id)
);
CREATE TABLE IF NOT EXISTS customer_sessions (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id,restaurant_id) REFERENCES customers(id,restaurant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_expiry ON customer_sessions(restaurant_id,customer_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at);
ALTER TABLE orders ADD COLUMN customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(restaurant_id,customer_id,created_at DESC);
