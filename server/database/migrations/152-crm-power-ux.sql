-- 152: CRM Power-User UX & Integrations (Phase 3). Stacked on 148.
-- Adds: full-text search indexes (F8), saved views (F9), unified communication
-- log + contact preferences (F10), documents/attachments (F13), opportunity
-- line-items + quote link (F14), and sales targets/quotas (F15).
-- All additive, IF NOT EXISTS guarded — safe on the shared dev DB.

-- ── F8: full-text search GIN indexes ─────────────────────────────────────────
-- Expression indexes over an english tsvector built from the salient text columns
-- of each entity. The search util (server/utils/crm/search.ts) builds the matching
-- to_tsvector(...) expression, so these indexes are what keep it fast.
CREATE INDEX IF NOT EXISTS idx_crm_people_fts ON crm_people USING gin (
  to_tsvector('english',
    COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') || ' ' ||
    COALESCE(email,'') || ' ' || COALESCE(job_title,'') || ' ' || COALESCE(notes,''))
);
CREATE INDEX IF NOT EXISTS idx_crm_companies_fts ON crm_companies USING gin (
  to_tsvector('english',
    COALESCE(name,'') || ' ' || COALESCE(domain,'') || ' ' || COALESCE(notes,''))
);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_fts ON crm_opportunities USING gin (
  to_tsvector('english', COALESCE(name,'') || ' ' || COALESCE(notes,''))
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_fts ON crm_activities USING gin (
  to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(body,''))
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_fts ON crm_tasks USING gin (
  to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(description,''))
);

-- ── F9: saved views (per-user + shared) ──────────────────────────────────────
-- entity = which list the view targets. filters/columns are app-defined JSON.
-- is_shared = visible to all staff for the client; otherwise only created_by.
CREATE TABLE IF NOT EXISTS crm_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL CHECK (entity IN ('people','companies','opportunities')),
  name        TEXT NOT NULL,
  filters     JSONB NOT NULL DEFAULT '{}',
  columns     JSONB NOT NULL DEFAULT '[]',
  is_shared   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_views_client_entity ON crm_views (client_id, entity);

-- ── F10: unified communication log + contact preferences ─────────────────────
-- Polymorphic-ish: a row may reference a person and/or a company. channel covers
-- email/call/sms/meeting/note; direction inbound|outbound (null for note/meeting).
-- source distinguishes manual entry from the email/lead bridges (3D.2).
CREATE TABLE IF NOT EXISTS crm_communications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  person_id    UUID,
  company_id   UUID,
  channel      TEXT NOT NULL CHECK (channel IN ('email','call','sms','meeting','note')),
  direction    TEXT CHECK (direction IN ('inbound','outbound')),
  subject      TEXT,
  body         TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  external_id  TEXT,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','email_bridge','lead_bridge')),
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_comms_client_person ON crm_communications (client_id, person_id);
CREATE INDEX IF NOT EXISTS idx_crm_comms_client_company ON crm_communications (client_id, company_id);
-- Idempotency for bridged ingestion: one row per (client, source, external_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_comms_external
  ON crm_communications (client_id, source, external_id) WHERE external_id IS NOT NULL;

-- Contact preferences on people (do-not-contact honoured by the email bridge).
ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS do_not_contact   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS do_not_email     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS do_not_call      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS do_not_sms       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS preferred_channel TEXT;
ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS best_time        TEXT;

-- ── F13: documents / attachments on records ──────────────────────────────────
-- file_key is the R2 object key. Signed URLs are minted on download; nothing
-- public. expires_at drives the "expiring" badge in the UI (e.g. proposals).
CREATE TABLE IF NOT EXISTS crm_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL CHECK (target_type IN ('person','company','opportunity')),
  target_id     UUID NOT NULL,
  file_key      TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    BIGINT,
  document_type TEXT,
  expires_at    TIMESTAMPTZ,
  uploaded_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_documents_target ON crm_documents (client_id, target_type, target_id);

-- ── F14: opportunity line-items + quote link ─────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_opportunity_line_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  quantity       NUMERIC(14,2) NOT NULL DEFAULT 1,
  unit_price     NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total     NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_line_items_opp ON crm_opportunity_line_items (opportunity_id);
-- Link to an existing agency quote (the quotes module owns the quote itself).
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS quote_id UUID;

-- ── F15: sales targets / quotas ──────────────────────────────────────────────
-- Per-rep target over a window. target_type revenue (won value) | count (won deals).
CREATE TABLE IF NOT EXISTS crm_sales_targets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  target_type   TEXT NOT NULL DEFAULT 'revenue' CHECK (target_type IN ('revenue','count')),
  target_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_targets_client_period ON crm_sales_targets (client_id, period_start, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_targets_unique
  ON crm_sales_targets (client_id, user_id, period_start, period_end, target_type);
