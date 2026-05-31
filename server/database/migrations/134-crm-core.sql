-- 134: CRM core — companies, people, custom fields, vertical scaffolding (Slice 1)
-- Multi-tenant: client_id (FK agency_clients) on every row; app-level isolation.
-- Ported/generalised from the in-house crm-dashboard project (contacts/accounts).

-- Available verticals (code|config packs). Seeded with the always-on generic core.
CREATE TABLE IF NOT EXISTS crm_verticals (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'config' CHECK (kind IN ('code','config')),
  is_core    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO crm_verticals (key, name, kind, is_core)
VALUES ('generic', 'Generic CRM', 'code', true)
ON CONFLICT (key) DO NOTHING;

-- Which verticals a client has enabled.
CREATE TABLE IF NOT EXISTS crm_client_verticals (
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  vertical_key TEXT NOT NULL REFERENCES crm_verticals(key) ON DELETE CASCADE,
  enabled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, vertical_key)
);

-- Per-client custom field definitions for core objects.
CREATE TABLE IF NOT EXISTS crm_custom_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN ('person','company')),
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  field_type  TEXT NOT NULL DEFAULT 'text'
              CHECK (field_type IN ('text','number','currency','date','status','dropdown','checkbox','rating','link','email','phone','location','tags')),
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, object_type, key)
);

-- Companies (≈ Twenty Company / source accounts). Clean schema (source `accounts` was inferred).
CREATE TABLE IF NOT EXISTS crm_companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  domain        TEXT,
  phone         TEXT,
  employees     INTEGER,
  address_line1 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT DEFAULT 'AU',
  notes         TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- People (≈ Twenty Person / source contacts). Ported columns; dealership_id→client_id, account_id→company_id.
CREATE TABLE IF NOT EXISTS crm_people (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  mobile        TEXT,
  job_title     TEXT,
  department    TEXT,
  city          TEXT,
  notes         TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_client ON crm_companies(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_people_client ON crm_people(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_people_company ON crm_people(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_lookup ON crm_custom_fields(client_id, object_type, position);
