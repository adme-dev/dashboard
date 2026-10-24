-- Existing-source adoption only: no entitlement, provisioning or editor permission.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_customer_adoption_grants (
  grant_id UUID PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES page_studio_customer_site_requests(site_id),
  revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 2147483646),
  operator_id UUID NOT NULL REFERENCES team_members(id),
  operator_login_hash TEXT NOT NULL CHECK(operator_login_hash ~ '^[a-f0-9]{64}$'),
  identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id),
  workspace_id UUID NOT NULL REFERENCES page_studio_customer_workspaces(id),
  source JSONB NOT NULL CHECK(jsonb_typeof(source)='object'),
  source_digest TEXT NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  request JSONB NOT NULL CHECK(jsonb_typeof(request)='object'),
  request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  withdrawn_at TIMESTAMPTZ,
  UNIQUE(grant_id,revision,site_id), UNIQUE(site_id,revision),
  CHECK(isfinite(issued_at) AND isfinite(expires_at) AND expires_at>issued_at AND expires_at<=issued_at+interval '24 hours'),
  CHECK((enabled AND withdrawn_at IS NULL) OR (NOT enabled AND withdrawn_at IS NOT NULL AND withdrawn_at>=issued_at)),
  CHECK((source->'scope'->>'siteId'=site_id::text AND source->'scope'->>'environment'='staging'
    AND source->'owner'->>'identityId'=identity_id::text AND source->'owner'->>'workspaceId'=workspace_id::text
    AND request->>'grantId'=grant_id::text AND request->>'sourceDigest'=source_digest
    AND (request->>'expiresAt')::timestamptz=expires_at) IS TRUE)
);
CREATE TABLE IF NOT EXISTS page_studio_customer_adoption_selections (
  site_id UUID PRIMARY KEY REFERENCES page_studio_customer_site_requests(site_id),
  grant_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 2147483646),
  FOREIGN KEY(grant_id,revision,site_id) REFERENCES page_studio_customer_adoption_grants(grant_id,revision,site_id)
);
CREATE OR REPLACE FUNCTION guard_page_studio_customer_adoption_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous page_studio_customer_adoption_selections%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Adoption grant history is immutable'; END IF;
  PERFORM id FROM page_studio_sites WHERE id=NEW.site_id FOR NO KEY UPDATE NOWAIT;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['enabled','withdrawn_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['enabled','withdrawn_at'])
      OR NOT OLD.enabled OR NEW.enabled OR NEW.withdrawn_at IS NULL THEN
      RAISE EXCEPTION 'Adoption grant permits withdrawal only';
    END IF;
    NEW.withdrawn_at:=clock_timestamp();
  ELSE
    SELECT * INTO previous FROM page_studio_customer_adoption_selections WHERE site_id=NEW.site_id;
    IF NEW.revision<>COALESCE(previous.revision,0)+1 OR NOT NEW.enabled OR NEW.withdrawn_at IS NOT NULL
      OR (previous.grant_id IS NOT NULL AND EXISTS(SELECT 1 FROM page_studio_customer_adoption_grants
        WHERE grant_id=previous.grant_id AND enabled AND expires_at>clock_timestamp())) THEN
      RAISE EXCEPTION 'Adoption grant selection changed';
    END IF;
  END IF;
  INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
    VALUES(NEW.source->'scope'->>'tenantId',(NEW.source->'scope'->>'clientId')::uuid,NEW.site_id,NEW.operator_id,'agency',
      CASE WHEN TG_OP='INSERT' THEN 'customer.adoption-grant.issued' ELSE 'customer.adoption-grant.withdrawn' END,
      'customer_adoption_grant',NEW.grant_id::text,jsonb_build_object('revision',NEW.revision,'expiresAt',NEW.expires_at,'sourceDigest',NEW.source_digest));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_customer_adoption_grant_guard ON page_studio_customer_adoption_grants;
CREATE TRIGGER page_studio_customer_adoption_grant_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_customer_adoption_grants
  FOR EACH ROW EXECUTE FUNCTION guard_page_studio_customer_adoption_grant();
CREATE OR REPLACE FUNCTION guard_page_studio_customer_adoption_selection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Adoption selection history must remain'; END IF;
  PERFORM id FROM page_studio_sites WHERE id=NEW.site_id FOR NO KEY UPDATE NOWAIT;
  IF TG_OP='UPDATE' AND (NEW.site_id<>OLD.site_id OR NEW.revision<>OLD.revision+1 OR NEW.grant_id=OLD.grant_id) THEN
    RAISE EXCEPTION 'Adoption selection requires exact successor';
  END IF;
  IF TG_OP='INSERT' AND NEW.revision<>1 THEN RAISE EXCEPTION 'Adoption selection requires initial revision'; END IF;
  IF NOT EXISTS(SELECT 1 FROM page_studio_customer_adoption_grants WHERE grant_id=NEW.grant_id
    AND site_id=NEW.site_id AND revision=NEW.revision AND enabled AND expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'Adoption selection is unavailable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_customer_adoption_selection_guard ON page_studio_customer_adoption_selections;
CREATE TRIGGER page_studio_customer_adoption_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON page_studio_customer_adoption_selections
  FOR EACH ROW EXECUTE FUNCTION guard_page_studio_customer_adoption_selection();
ALTER TABLE page_studio_customer_editor_handoffs ADD COLUMN IF NOT EXISTS adoption_grant_id UUID;
ALTER TABLE page_studio_customer_editor_handoffs ADD COLUMN IF NOT EXISTS adoption_grant_revision INTEGER;
ALTER TABLE page_studio_customer_editor_handoffs DROP CONSTRAINT IF EXISTS page_studio_customer_editor_handoffs_purpose_check;
ALTER TABLE page_studio_customer_editor_handoffs ADD CONSTRAINT page_studio_customer_editor_handoffs_purpose_check CHECK(purpose IN ('editor','cms-setup','cms-adoption'));
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_customer_editor_handoffs'::regclass AND conname='customer_handoff_adoption_grant') THEN
    ALTER TABLE page_studio_customer_editor_handoffs ADD CONSTRAINT customer_handoff_adoption_grant CHECK(
      (purpose='cms-adoption' AND environment='staging' AND entitlement_id IS NULL AND adoption_grant_id IS NOT NULL AND adoption_grant_revision IS NOT NULL)
      OR (purpose<>'cms-adoption' AND adoption_grant_id IS NULL AND adoption_grant_revision IS NULL));
    ALTER TABLE page_studio_customer_editor_handoffs ADD CONSTRAINT customer_handoff_adoption_scope
      FOREIGN KEY(adoption_grant_id,adoption_grant_revision,site_id) REFERENCES page_studio_customer_adoption_grants(grant_id,revision,site_id);
  END IF;
END $$;
COMMIT;
