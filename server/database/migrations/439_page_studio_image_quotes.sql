-- Saved quotes bind one actor intent to immutable generation inputs and price.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS page_studio_image_quotes (
  quote_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('agency','client')),
  actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
  intent_id UUID NOT NULL,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  quote JSONB NOT NULL CHECK (jsonb_typeof(quote)='object' AND octet_length(quote::text)<=16000),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,client_id,site_id,environment,actor_role,actor_id,intent_id),
  UNIQUE (tenant_id,client_id,site_id,environment,quote_id),
  FOREIGN KEY (tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id)
);
CREATE INDEX IF NOT EXISTS page_studio_image_quotes_expiry ON page_studio_image_quotes(expires_at);
COMMIT;
