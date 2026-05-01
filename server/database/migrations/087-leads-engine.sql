-- 087-leads-engine.sql
-- Phase 1 of the Leads Engine (Zapier replacement for Meta+Google ad inquiries).
-- See docs/superpowers/specs/2026-04-30-leads-engine-design.md.
--
-- Tables:
--   lead_webhook_endpoints  - per-client tokenized URL+key for Google
--   lead_form_metadata      - discovered form schema for filter builder
--   leads                   - canonical normalized lead
--   lead_form_rules         - one rule set per (source, form_id)
--   lead_rule_destinations  - per-rule fan-out targets
--   lead_deliveries         - audit log of every dispatch attempt
--   lead_ingestion_errors   - 30-day TTL bucket for ops review
--
-- Smart Watch reason: notifications.reason already accepts free text (077-),
-- so 'lead_arrived' is a value, not a schema change.

BEGIN;

-- ============================================
-- lead_webhook_endpoints
-- ============================================
CREATE TABLE IF NOT EXISTS lead_webhook_endpoints (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  source                  VARCHAR(20) NOT NULL DEFAULT 'google',
  url_token               TEXT NOT NULL UNIQUE,
  secret_key              TEXT NOT NULL,
  secret_key_previous     TEXT,
  secret_key_grace_until  TIMESTAMPTZ,
  rotated_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source IN ('google','meta_app'))
);
CREATE INDEX IF NOT EXISTS idx_lead_webhook_endpoints_client
  ON lead_webhook_endpoints(client_id);

-- ============================================
-- lead_form_metadata
-- ============================================
CREATE TABLE IF NOT EXISTS lead_form_metadata (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        VARCHAR(20) NOT NULL,
  form_id       TEXT NOT NULL,
  form_name     TEXT,
  fields        JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_lead_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, form_id)
);

-- ============================================
-- leads
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  source          VARCHAR(20) NOT NULL,
  source_lead_id  TEXT NOT NULL,
  form_id         TEXT,
  form_name       TEXT,
  ad_id           TEXT,
  ad_name         TEXT,
  campaign_id     TEXT,
  campaign_name   TEXT,
  page_id         TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  attribution     JSONB,
  score           INT,
  score_reasons   JSONB,
  status          VARCHAR(20) NOT NULL DEFAULT 'new',
  spam_reasons    JSONB,
  assigned_to     UUID REFERENCES team_members(id) ON DELETE SET NULL,
  contacted_at    TIMESTAMPTZ,
  contacted_by    UUID REFERENCES team_members(id) ON DELETE SET NULL,
  notes           TEXT,
  created_by      UUID REFERENCES team_members(id) ON DELETE SET NULL,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source IN ('meta','google','manual')),
  CHECK (status IN ('new','contacted','qualified','won','lost','spam_suspected'))
);

-- Idempotency: one live row per (source, source_lead_id). Soft-deleted rows excluded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_source_id_live
  ON leads(source, source_lead_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_client_status_submitted
  ON leads(client_id, status, submitted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_form_submitted
  ON leads(form_id, submitted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_new
  ON leads(submitted_at DESC) WHERE status='new' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_unmapped
  ON leads(submitted_at DESC) WHERE client_id IS NULL AND deleted_at IS NULL;

-- ============================================
-- lead_form_rules
-- ============================================
CREATE TABLE IF NOT EXISTS lead_form_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  source      VARCHAR(20) NOT NULL,
  form_id     TEXT NOT NULL,
  form_name   TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, form_id),
  CHECK (source IN ('meta','google'))
);

-- ============================================
-- lead_rule_destinations
-- ============================================
CREATE TABLE IF NOT EXISTS lead_rule_destinations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID NOT NULL REFERENCES lead_form_rules(id) ON DELETE CASCADE,
  destination_type  VARCHAR(30) NOT NULL,
  config            JSONB NOT NULL,
  filter            JSONB,
  delay_minutes     INT NOT NULL DEFAULT 0,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (destination_type IN (
    'portal','webhook','slack','email','sheets','assign_user',
    'sms','autoresponder_email','autoresponder_sms'
  )),
  CHECK (delay_minutes >= 0 AND delay_minutes <= 1440)
);
CREATE INDEX IF NOT EXISTS idx_lrd_rule
  ON lead_rule_destinations(rule_id, sort_order);

-- ============================================
-- lead_deliveries
-- ============================================
CREATE TABLE IF NOT EXISTS lead_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rule_destination_id UUID REFERENCES lead_rule_destinations(id) ON DELETE SET NULL,
  destination_type    VARCHAR(30) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  scheduled_at        TIMESTAMPTZ NOT NULL,
  claimed_at          TIMESTAMPTZ,
  claimed_by          TEXT,
  attempted_at        TIMESTAMPTZ,
  last_error          TEXT,
  retry_count         INT NOT NULL DEFAULT 0,
  response_meta       JSONB,
  idempotency_key     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending','claimed','delivered','failed','cancelled','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_ld_lead ON lead_deliveries(lead_id);
CREATE INDEX IF NOT EXISTS idx_ld_pending
  ON lead_deliveries(scheduled_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_ld_claimed
  ON lead_deliveries(claimed_at) WHERE status='claimed';

-- ============================================
-- lead_ingestion_errors  (30-day TTL via cron)
-- ============================================
CREATE TABLE IF NOT EXISTS lead_ingestion_errors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       VARCHAR(20) NOT NULL,
  raw_payload  JSONB,
  headers      JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lie_created ON lead_ingestion_errors(created_at);

-- updated_at trigger for tables that need it
DO $$ BEGIN
  CREATE TRIGGER update_lead_form_metadata_updated_at
    BEFORE UPDATE ON lead_form_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_lead_form_rules_updated_at
    BEFORE UPDATE ON lead_form_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_lead_rule_destinations_updated_at
    BEFORE UPDATE ON lead_rule_destinations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_lead_deliveries_updated_at
    BEFORE UPDATE ON lead_deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
