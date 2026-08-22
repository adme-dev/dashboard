-- 337: durable client financial allocation mappings and audit history.
-- Additive and idempotent: Xero cache refreshes must not erase allocation intent.

BEGIN;

CREATE TABLE IF NOT EXISTS agency_client_xero_tracking_mappings (
  tenant_id           TEXT NOT NULL,
  client_id           UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  tracking_option_id  TEXT,
  tracking_option_name TEXT NOT NULL,
  confirmed_by        UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_acxtm_tracking_option
  ON agency_client_xero_tracking_mappings (tenant_id, tracking_option_name);

CREATE TABLE IF NOT EXISTS xero_project_allocations (
  tenant_id             TEXT NOT NULL,
  line_item_id          TEXT NOT NULL,
  invoice_id            TEXT NOT NULL,
  client_id             UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_invoice_type TEXT NOT NULL,
  source_invoice_date DATE NOT NULL,
  source_account_code TEXT,
  source_description TEXT,
  source_ex_gst_cents BIGINT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  assigned_by           UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, line_item_id)
);

CREATE INDEX IF NOT EXISTS idx_xpa_client_project
  ON xero_project_allocations (tenant_id, client_id, project_id);

CREATE INDEX IF NOT EXISTS idx_xpa_invoice
  ON xero_project_allocations (tenant_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_xpa_fingerprint
  ON xero_project_allocations (tenant_id, source_fingerprint);

CREATE TABLE IF NOT EXISTS financial_allocation_audit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type        TEXT NOT NULL CHECK (source_type IN ('media_spend', 'xero_line', 'client_tracking')),
  tenant_id          TEXT,
  source_key         TEXT NOT NULL,
  client_id          UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  previous_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  new_project_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  actor_id           UUID REFERENCES team_members(id) ON DELETE SET NULL,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faa_client_changed
  ON financial_allocation_audit (tenant_id, client_id, changed_at DESC);

-- Audit history is append-only. Protect it at the database boundary so every
-- caller, not only the application service, preserves allocation history.
CREATE OR REPLACE FUNCTION prevent_financial_allocation_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'financial_allocation_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS financial_allocation_audit_append_only
  ON financial_allocation_audit;
CREATE TRIGGER financial_allocation_audit_append_only
  BEFORE UPDATE OR DELETE ON financial_allocation_audit
  FOR EACH ROW
  EXECUTE FUNCTION prevent_financial_allocation_audit_mutation();

DROP TRIGGER IF EXISTS financial_allocation_audit_append_only_truncate
  ON financial_allocation_audit;
CREATE TRIGGER financial_allocation_audit_append_only_truncate
  BEFORE TRUNCATE ON financial_allocation_audit
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_financial_allocation_audit_mutation();

COMMIT;
