CREATE TABLE IF NOT EXISTS olist_oauth_credentials (
  account_key VARCHAR(40) PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS olist_oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS olist_oauth_states_expires_at_idx ON olist_oauth_states (expires_at);
