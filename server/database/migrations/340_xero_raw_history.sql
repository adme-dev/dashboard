-- 340: append-only history for the Xero landing layer (ADR-007).
--
-- The xero_raw_* tables are a latest-version mirror (one row per Xero
-- record). Audits also need "what did this record look like on date X",
-- so every changed payload the sync sees is appended here, keyed by
-- Xero's own UpdatedDateUTC — one row per version, never updated.
-- History starts accumulating from the first sync after this deploys;
-- earlier versions are unrecoverable (Xero does not expose them).

BEGIN;

CREATE TABLE IF NOT EXISTS xero_raw_history (
  entity            TEXT NOT NULL,           -- 'invoice' | 'contact' | ...
  tenant_id         TEXT NOT NULL,
  xero_id           UUID NOT NULL,
  xero_updated_utc  TIMESTAMPTZ NOT NULL,
  raw_payload       JSONB NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity, xero_id, xero_updated_utc)
);

CREATE INDEX IF NOT EXISTS xero_raw_history_tenant_idx
  ON xero_raw_history (tenant_id, entity, synced_at DESC);

COMMIT;
