-- Safe lifecycle metadata and immutable audit evidence for CRM lead inbox routes.

BEGIN;

ALTER TABLE crm_email_routes
  ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT 'CRM inbox',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS revoked_by UUID,
  ADD COLUMN IF NOT EXISTS revoked_actor_type TEXT,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS replaced_by_route_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_email_routes_label_length_check'
      AND conrelid = 'crm_email_routes'::regclass
  ) THEN
    ALTER TABLE crm_email_routes
      ADD CONSTRAINT crm_email_routes_label_length_check
      CHECK (char_length(label) BETWEEN 1 AND 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_email_routes_revoked_actor_type_check'
      AND conrelid = 'crm_email_routes'::regclass
  ) THEN
    ALTER TABLE crm_email_routes
      ADD CONSTRAINT crm_email_routes_revoked_actor_type_check
      CHECK (
        revoked_actor_type IS NULL
        OR revoked_actor_type IN ('team_member', 'client_user', 'system')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_email_routes_revoked_reason_length_check'
      AND conrelid = 'crm_email_routes'::regclass
  ) THEN
    ALTER TABLE crm_email_routes
      ADD CONSTRAINT crm_email_routes_revoked_reason_length_check
      CHECK (revoked_reason IS NULL OR char_length(revoked_reason) BETWEEN 1 AND 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_email_routes_replaced_by_route_fkey'
      AND conrelid = 'crm_email_routes'::regclass
  ) THEN
    ALTER TABLE crm_email_routes
      ADD CONSTRAINT crm_email_routes_replaced_by_route_fkey
      FOREIGN KEY (replaced_by_route_id)
      REFERENCES crm_email_routes(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_email_routes_active_lead_inbox
  ON crm_email_routes (client_id)
  WHERE route_kind = 'lead_inbox'
    AND is_active = TRUE
    AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_email_route_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES crm_email_routes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  actor_id UUID,
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('team_member', 'client_user', 'system')),
  action TEXT NOT NULL
    CHECK (action IN ('created', 'rotated', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm_email_route_audits
  DROP COLUMN IF EXISTS metadata;

CREATE INDEX IF NOT EXISTS idx_crm_email_route_audits_route_created
  ON crm_email_route_audits (route_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION prevent_crm_email_route_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'crm_email_route_audits is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_email_route_audits_append_only
  ON crm_email_route_audits;
CREATE TRIGGER trg_crm_email_route_audits_append_only
BEFORE UPDATE OR DELETE ON crm_email_route_audits
FOR EACH ROW
EXECUTE FUNCTION prevent_crm_email_route_audit_mutation();

COMMIT;
