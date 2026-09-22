CREATE TABLE IF NOT EXISTS automation_orders (
  id BIGSERIAL PRIMARY KEY,
  external_order_number VARCHAR(80) NOT NULL UNIQUE,
  sku VARCHAR(80) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price > 0),
  request_hash CHAR(64) NOT NULL,
  target_company VARCHAR(20) NOT NULL,
  target_company_name VARCHAR(120) NOT NULL,
  warehouse_id BIGINT NOT NULL,
  routing_rule VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('processing', 'simulated', 'created', 'failed')),
  olist_order_id VARCHAR(100),
  error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS automation_orders_created_at_idx ON automation_orders (created_at);
CREATE INDEX IF NOT EXISTS automation_orders_status_idx ON automation_orders (status);
