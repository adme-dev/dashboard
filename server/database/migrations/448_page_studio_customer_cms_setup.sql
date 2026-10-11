-- Restricted native setup children; no production/editor grants or seeded approvals.
BEGIN;
ALTER TABLE page_studio_customer_editor_handoffs
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'editor'
  CHECK (purpose IN ('editor', 'cms-setup'));
CREATE TABLE IF NOT EXISTS page_studio_customer_cms_setup_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL DEFAULT 'staging' CHECK (environment = 'staging'),
  tenant_id TEXT NOT NULL,
  business_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  site_id UUID NOT NULL UNIQUE REFERENCES page_studio_customer_site_requests(site_id) ON DELETE RESTRICT,
  identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  approved_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  preview_policy JSONB NOT NULL CHECK (jsonb_typeof(preview_policy)='object'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > issued_at),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (workspace_id, business_id) REFERENCES page_studio_business_owners(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, business_id, site_id) REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE RESTRICT
);
CREATE OR REPLACE FUNCTION audit_page_studio_customer_cms_setup_approval() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'CMS setup approval tombstones must be retained';
  END IF;
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'enabled') IS DISTINCT FROM (to_jsonb(OLD)-'enabled')
    OR NOT OLD.enabled OR NEW.enabled) THEN
    RAISE EXCEPTION 'CMS setup approval scope and deadline are immutable; only withdrawal is allowed';
  END IF;
  INSERT INTO page_studio_audit_events
    (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
    VALUES(NEW.tenant_id,NEW.business_id,NEW.site_id,NEW.approved_by,'agency',
      CASE WHEN TG_OP='INSERT' THEN 'customer.cms-setup.approved' ELSE 'customer.cms-setup.withdrawn' END,
      'customer_cms_setup_approval',NEW.id::text,
      jsonb_build_object('workspaceId',NEW.workspace_id,'identityId',NEW.identity_id,'expiresAt',NEW.expires_at,'environment',NEW.environment));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS page_studio_customer_cms_setup_approval_audit ON page_studio_customer_cms_setup_approvals;
CREATE TRIGGER page_studio_customer_cms_setup_approval_audit BEFORE INSERT OR UPDATE OR DELETE ON page_studio_customer_cms_setup_approvals
  FOR EACH ROW EXECUTE FUNCTION audit_page_studio_customer_cms_setup_approval();
COMMIT;
