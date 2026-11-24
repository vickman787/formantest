-- Forma schema. Applied by src/lib/db.ts ensureSchema() on boot (dev + prod).
-- Postgres is the durable store: no job, payment, session or event lives
-- only in server memory.

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  wallet TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brand_kits (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  colors JSONB NOT NULL DEFAULT '[]',
  website_or_social TEXT NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  service TEXT NOT NULL,
  brief JSONB NOT NULL,
  brief_hash TEXT NOT NULL,
  brand_kit_id TEXT REFERENCES brand_kits(id),
  state TEXT NOT NULL DEFAULT 'draft',
  payment_state TEXT NOT NULL DEFAULT 'unfunded',
  amount_base_units TEXT NOT NULL DEFAULT '1000000',
  asset TEXT NOT NULL DEFAULT 'QUSDC',
  chain_id INT NOT NULL DEFAULT 1990,
  chain_job_id TEXT,
  terms_version TEXT NOT NULL DEFAULT 'v1',
  fund_deadline TIMESTAMPTZ,
  delivery_deadline TIMESTAMPTZ,
  review_deadline TIMESTAMPTZ,
  manifest_hash TEXT,
  manifest JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chain_job_id)
);

CREATE TABLE IF NOT EXISTS job_steps (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INT NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  provider_request_id TEXT,
  usage_json JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, stage, attempt)
);

CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  version INT NOT NULL DEFAULT 1,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, version, filename)
);

CREATE TABLE IF NOT EXISTS chain_events (
  chain_id INT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INT NOT NULL,
  contract TEXT NOT NULL,
  action TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id),
  payload JSONB NOT NULL DEFAULT '{}',
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS support_issues (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  description TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT '',
  refund_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_order ON artifacts(order_id, version);
