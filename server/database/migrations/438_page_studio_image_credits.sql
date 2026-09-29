-- Customer prepaid image credits are separate from monthly AI quotas.
-- Accounting history survives site archival and is never rewritten by refunds.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS page_studio_image_wallets (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES agency_clients(id),
  environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance BETWEEN -9000000000000 AND 9000000000000),
  reserved BIGINT NOT NULL DEFAULT 0 CHECK (reserved BETWEEN 0 AND 9000000000000),
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,client_id,environment)
);
CREATE TABLE IF NOT EXISTS page_studio_image_credit_reservations (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  environment TEXT NOT NULL,
  reservation_id TEXT NOT NULL CHECK (reservation_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  site_id UUID NOT NULL,
  actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('agency','client')),
  credits BIGINT NOT NULL CHECK (credits BETWEEN 1 AND 1000000000),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','settled','released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id,client_id,environment,reservation_id),
  FOREIGN KEY (tenant_id,client_id,environment) REFERENCES page_studio_image_wallets(tenant_id,client_id,environment),
  FOREIGN KEY (tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id),
  CHECK ((state='reserved') = (finished_at IS NULL))
);
CREATE TABLE IF NOT EXISTS page_studio_image_credit_entries (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  environment TEXT NOT NULL,
  entry_id TEXT NOT NULL CHECK (length(entry_id) BETWEEN 1 AND 180),
  kind TEXT NOT NULL CHECK (kind IN ('grant','reserve','settle','release','refund','dispute','reinstatement')),
  credit_delta BIGINT NOT NULL CHECK (credit_delta BETWEEN -1000000000 AND 1000000000),
  reserved_delta BIGINT NOT NULL CHECK (reserved_delta BETWEEN -1000000000 AND 1000000000),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  reservation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,client_id,environment,entry_id),
  FOREIGN KEY (tenant_id,client_id,environment) REFERENCES page_studio_image_wallets(tenant_id,client_id,environment),
  FOREIGN KEY (tenant_id,client_id,environment,reservation_id) REFERENCES page_studio_image_credit_reservations(tenant_id,client_id,environment,reservation_id)
);
CREATE INDEX IF NOT EXISTS page_studio_image_credit_history
  ON page_studio_image_credit_entries(tenant_id,client_id,environment,created_at DESC,entry_id);
CREATE OR REPLACE FUNCTION page_studio_image_credit_history_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Image credit history is immutable' USING ERRCODE='55000';
END; $$;
DROP TRIGGER IF EXISTS page_studio_image_credit_history_immutable ON page_studio_image_credit_entries;
CREATE TRIGGER page_studio_image_credit_history_immutable
  BEFORE UPDATE OR DELETE ON page_studio_image_credit_entries
  FOR EACH ROW EXECUTE FUNCTION page_studio_image_credit_history_immutable();
COMMIT;
