-- Preserve legacy scope IDs while allowing explicit customer workspace owners.
-- Run before enabling any standalone site route. Does not allocate customer content storage.
BEGIN;

-- Serialize backfill + registration with legacy client creation.
LOCK TABLE agency_clients IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS page_studio_business_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_client_id UUID UNIQUE REFERENCES agency_clients(id) ON DELETE CASCADE,
  workspace_id UUID UNIQUE REFERENCES page_studio_customer_workspaces(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (num_nonnulls(agency_client_id, workspace_id) = 1),
  CHECK (agency_client_id IS NULL OR id = agency_client_id),
  UNIQUE (workspace_id, id)
);

CREATE OR REPLACE FUNCTION guard_page_studio_business_owner_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.agency_client_id, NEW.workspace_id)
    IS DISTINCT FROM ROW(OLD.id, OLD.agency_client_id, OLD.workspace_id) THEN
    RAISE EXCEPTION 'Page Studio business ownership is immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS page_studio_business_owner_immutable ON page_studio_business_owners;
CREATE TRIGGER page_studio_business_owner_immutable BEFORE UPDATE ON page_studio_business_owners
  FOR EACH ROW EXECUTE FUNCTION guard_page_studio_business_owner_update();

-- Both paths write-lock the workspace, including direct trusted database writes.
CREATE OR REPLACE FUNCTION guard_page_studio_workspace_ownership()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN RETURN NEW; END IF;
  -- A lock alone does not invalidate a REPEATABLE READ snapshot. Advancing the
  -- row version without changing the name makes a stale concurrent transaction
  -- fail with serialization_failure instead of accepting two ownership claims.
  UPDATE page_studio_customer_workspaces SET name = name WHERE id = NEW.workspace_id;
  IF TG_TABLE_NAME = 'page_studio_business_owners' THEN
    IF EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings WHERE workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'Workspace already has legacy ownership';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM page_studio_business_owners WHERE workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'Workspace already has standalone ownership';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS page_studio_business_owner_exclusive ON page_studio_business_owners;
CREATE TRIGGER page_studio_business_owner_exclusive BEFORE INSERT OR UPDATE ON page_studio_business_owners
  FOR EACH ROW EXECUTE FUNCTION guard_page_studio_workspace_ownership();
DROP TRIGGER IF EXISTS page_studio_legacy_owner_exclusive ON page_studio_workspace_client_bindings;
CREATE TRIGGER page_studio_legacy_owner_exclusive BEFORE INSERT OR UPDATE ON page_studio_workspace_client_bindings
  FOR EACH ROW EXECUTE FUNCTION guard_page_studio_workspace_ownership();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM agency_clients client JOIN page_studio_business_owners owner ON owner.id = client.id
    WHERE owner.agency_client_id IS DISTINCT FROM client.id) THEN
    RAISE EXCEPTION 'Conflicting Page Studio business ownership during backfill';
  END IF;
END $$;
INSERT INTO page_studio_business_owners (id, agency_client_id)
  SELECT id, id FROM agency_clients ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION register_page_studio_agency_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- A collision must abort the client insert, never silently adopt another owner.
  INSERT INTO page_studio_business_owners (id, agency_client_id) VALUES (NEW.id, NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS page_studio_agency_owner_registered ON agency_clients;
CREATE TRIGGER page_studio_agency_owner_registered AFTER INSERT ON agency_clients
  FOR EACH ROW EXECUTE FUNCTION register_page_studio_agency_owner();

ALTER TABLE page_studio_entitlements DROP CONSTRAINT IF EXISTS page_studio_entitlements_client_id_fkey;
ALTER TABLE page_studio_sites DROP CONSTRAINT IF EXISTS page_studio_sites_client_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_studio_entitlements_business_owner_fkey'
    AND conrelid = 'page_studio_entitlements'::regclass) THEN
    ALTER TABLE page_studio_entitlements ADD CONSTRAINT page_studio_entitlements_business_owner_fkey
      FOREIGN KEY (client_id) REFERENCES page_studio_business_owners(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_studio_sites_business_owner_fkey'
    AND conrelid = 'page_studio_sites'::regclass) THEN
    ALTER TABLE page_studio_sites ADD CONSTRAINT page_studio_sites_business_owner_fkey
      FOREIGN KEY (client_id) REFERENCES page_studio_business_owners(id) ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON COLUMN page_studio_sites.client_id IS 'Compatibility business scope ID; resolve ownership via page_studio_business_owners. Not always an agency client.';
COMMENT ON COLUMN page_studio_entitlements.client_id IS 'Compatibility business scope ID; resolve ownership via page_studio_business_owners. Not always an agency client.';

-- One approved preview per workspace, including after archival. This is also the
-- immutable customer actor/policy receipt; do not impersonate legacy audit roles.
CREATE TABLE IF NOT EXISTS page_studio_customer_site_requests (
  workspace_id UUID PRIMARY KEY,
  request_id UUID NOT NULL,
  actor_identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  business_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id UUID NOT NULL UNIQUE,
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  preview_policy JSONB NOT NULL CHECK (jsonb_typeof(preview_policy) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workspace_id, business_id) REFERENCES page_studio_business_owners(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, business_id, site_id) REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE RESTRICT
);
DROP TRIGGER IF EXISTS page_studio_customer_site_request_immutable ON page_studio_customer_site_requests;
CREATE TRIGGER page_studio_customer_site_request_immutable BEFORE UPDATE OR DELETE ON page_studio_customer_site_requests
  FOR EACH ROW EXECUTE FUNCTION prevent_page_studio_immutable_mutation();

COMMIT;
