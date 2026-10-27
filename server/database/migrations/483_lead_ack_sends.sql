-- 483: visitor auto-acknowledgement send ledger (XeroFlow Inbox phase 1).
-- Additive only. NOT APPLIED: requires owner approval before running anywhere.
--
-- One row per submission acknowledgement (idempotency_key). The
-- autoresponder_email adapter reserves a row under a per-client advisory lock,
-- so these rows enforce:
--   * one acknowledgement per (client, form, recipient) per rolling 24 h;
--   * the per-site (client) daily cap;
--   * replay safety: a retried or re-ingested submission maps to the same key.
-- recipient_hash is sha256 of the lowercased address; no raw address is stored.
-- Until this runs, the adapter fails without sending (the table is missing).
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS lead_ack_sends (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key     TEXT NOT NULL UNIQUE CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  client_id           UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  lead_id             UUID REFERENCES leads(id) ON DELETE SET NULL,
  rule_destination_id UUID REFERENCES lead_rule_destinations(id) ON DELETE SET NULL,
  form_key            TEXT NOT NULL CHECK (length(form_key) BETWEEN 1 AND 600),
  recipient_hash      TEXT NOT NULL CHECK (recipient_hash ~ '^[a-f0-9]{64}$'),
  status              TEXT NOT NULL DEFAULT 'reserved'
                      CHECK (status IN ('reserved', 'sent', 'failed')),
  provider_message_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_ack_sends_recipient_window
  ON lead_ack_sends (client_id, form_key, recipient_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ack_sends_client_day
  ON lead_ack_sends (client_id, created_at DESC);

COMMIT;
