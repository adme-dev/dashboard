-- Bind native editor handoffs to an environment and exact production plan.
-- Existing staging receipts/sessions keep their original authority and lifetime.
BEGIN;
ALTER TABLE page_studio_customer_editor_handoffs ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'staging';
ALTER TABLE page_studio_customer_editor_handoffs ADD COLUMN IF NOT EXISTS entitlement_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_customer_editor_handoffs'::regclass AND conname='customer_handoff_environment_plan') THEN
    ALTER TABLE page_studio_customer_editor_handoffs ADD CONSTRAINT customer_handoff_environment_plan CHECK (
      (environment='staging' AND entitlement_id IS NULL)
      OR (environment='production' AND entitlement_id IS NOT NULL AND purpose='editor'));
    ALTER TABLE page_studio_customer_editor_handoffs ADD CONSTRAINT customer_handoff_plan_scope
      FOREIGN KEY (tenant_id,business_id,entitlement_id) REFERENCES page_studio_entitlements(tenant_id,client_id,id) ON DELETE RESTRICT;
    ALTER TABLE page_studio_customer_editor_handoffs ADD CONSTRAINT customer_handoff_id_environment UNIQUE (id,environment);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_customer_editor_sessions'::regclass AND conname='customer_editor_claims_environment') THEN
    -- Replace only the original 447 claims check. Refuse an unexpected schema.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_customer_editor_sessions'::regclass
      AND conname='page_studio_customer_editor_sessions_check2' AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%environment%' AND pg_get_constraintdef(oid) LIKE '%staging%') THEN
      RAISE EXCEPTION 'Unexpected native editor claims constraint';
    END IF;
    ALTER TABLE page_studio_customer_editor_sessions DROP CONSTRAINT page_studio_customer_editor_sessions_check2;
    ALTER TABLE page_studio_customer_editor_sessions ADD CONSTRAINT customer_editor_claims_environment CHECK (
      (jsonb_typeof(claims)='object' AND claims->>'nonce'=nonce::text AND claims->>'role'='customer'
        AND claims->>'environment' IN ('staging','production')
        AND (claims->>'issuedAt')::numeric=extract(epoch FROM issued_at)
        AND (claims->>'expiresAt')::numeric=extract(epoch FROM expires_at)
        AND (claims->>'environment'='staging' OR (jsonb_typeof(claims->'capabilities')='array'
          AND claims->'capabilities' <@ '["workspace:create","workspace:reconnect","workspace:checkpoint","workspace:preview","workspace:terminate","workspace:status"]'::jsonb))) IS TRUE);
    ALTER TABLE page_studio_customer_editor_sessions ADD COLUMN environment TEXT GENERATED ALWAYS AS (claims->>'environment') STORED;
    ALTER TABLE page_studio_customer_editor_sessions ADD CONSTRAINT customer_editor_handoff_environment
      FOREIGN KEY (handoff_id,environment) REFERENCES page_studio_customer_editor_handoffs(id,environment) ON DELETE RESTRICT;
  END IF;
END $$;
-- Generated columns are not populated in NEW until after BEFORE triggers.
-- The immutable claims JSON is their source of truth; exclude the derived column
-- so a one-way revocation remains possible, without allowing claims to change.
CREATE OR REPLACE FUNCTION protect_page_studio_customer_editor_session() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['revoked_at','environment']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revoked_at','environment'])
    OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'Customer editor session claims and revocation are immutable';
  END IF;
  RETURN NEW;
END;
$$;
-- Handoff fields remain immutable. No plan, CMS target or expiry is rewritten.
COMMIT;
