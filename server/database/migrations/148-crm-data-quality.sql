-- 148: CRM Data Quality, Relationships & Governance (Phase 2). Stacked on 147.
-- Adds: lifecycle + tags + ownership columns, contact relationships, field-level
-- audit log, assignment rules, merge log, and per-client visibility settings.
-- All additive, IF NOT EXISTS guarded — safe on the shared dev DB.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── F5/F7: lifecycle, tags, ownership on contacts ─────────────────────────────
ALTER TABLE crm_people     ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT;
ALTER TABLE crm_people     ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE crm_people     ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE crm_people     ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE crm_companies  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT;
ALTER TABLE crm_companies  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE crm_companies  ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE crm_companies  ADD COLUMN IF NOT EXISTS assigned_to UUID;
-- crm_opportunities already has owner_id (mig 135); add assigned_to for parity.
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- Trigram indexes for dedupe candidate search (F6).
CREATE INDEX IF NOT EXISTS idx_crm_people_name_trgm
  ON crm_people USING gin ((COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_people_email_lower ON crm_people (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_crm_companies_name_trgm
  ON crm_companies USING gin (name gin_trgm_ops);

-- ── F11: contact relationships + company hierarchy ────────────────────────────
-- Polymorphic both ends. relationship_type covers person↔person, company↔company,
-- and person↔company; the inverse is derived in app code (relationships.ts).
CREATE TABLE IF NOT EXISTS crm_relationships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  from_type         TEXT NOT NULL CHECK (from_type IN ('person','company')),
  from_id           UUID NOT NULL,
  to_type           TEXT NOT NULL CHECK (to_type IN ('person','company')),
  to_id             UUID NOT NULL,
  relationship_type TEXT NOT NULL,
  is_decision_maker BOOLEAN NOT NULL DEFAULT false,
  is_primary_contact BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_rel_from ON crm_relationships (client_id, from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_crm_rel_to   ON crm_relationships (client_id, to_type, to_id);
-- Prevent exact duplicate edges.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_rel_edge
  ON crm_relationships (client_id, from_type, from_id, to_type, to_id, relationship_type);

-- ── F12: field-level audit trail ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_by  UUID,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_audit_entity
  ON crm_audit_log (entity_type, entity_id, changed_at DESC);

-- ── F7: assignment rules ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_assignment_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_type      TEXT NOT NULL DEFAULT 'person' CHECK (object_type IN ('person','opportunity')),
  strategy         TEXT NOT NULL DEFAULT 'round_robin'
                   CHECK (strategy IN ('round_robin','load_balanced','priority','single')),
  pool             JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of user ids
  assignment_index INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_assign_rules_client
  ON crm_assignment_rules (client_id, object_type) WHERE is_active;

-- ── F6: merge audit ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_merge_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person','company')),
  winner_id   UUID NOT NULL,
  loser_id    UUID NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  merged_by   UUID,
  merged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_merge_log_client ON crm_merge_log (client_id, merged_at DESC);

-- ── F7: per-client visibility setting ─────────────────────────────────────────
-- 'team' (default) = current behaviour, all client staff see all records.
-- 'owner' = non-admin users see only records they own/are assigned. Switching is a
-- settings write — no migration, and the default path is byte-for-byte unchanged.
CREATE TABLE IF NOT EXISTS crm_settings (
  client_id         UUID PRIMARY KEY REFERENCES agency_clients(id) ON DELETE CASCADE,
  record_visibility TEXT NOT NULL DEFAULT 'team' CHECK (record_visibility IN ('team','owner')),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
