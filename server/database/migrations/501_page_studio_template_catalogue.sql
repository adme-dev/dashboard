-- Additive, default-private catalogue metadata only. No source registrations,
-- audience grants, public activation or existing-account mutations.
BEGIN;
CREATE TABLE page_studio_template_entries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_tenant_id TEXT NOT NULL CHECK (length(btrim(owner_tenant_id)) BETWEEN 1 AND 200),
 slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
 category TEXT NOT NULL DEFAULT 'automotive' CHECK (category='automotive'),
 visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','published-eligible')),
 withdrawn_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_tenant_id,slug), UNIQUE(id,owner_tenant_id)
);
CREATE TABLE page_studio_template_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 template_id UUID NOT NULL REFERENCES page_studio_template_entries(id) ON DELETE RESTRICT,
 format TEXT NOT NULL CHECK (format IN ('typed','code-pages')),
 source_tenant_id TEXT NOT NULL CHECK (length(btrim(source_tenant_id)) BETWEEN 1 AND 200),
 source_client_id UUID NOT NULL, source_site_id UUID NOT NULL,
 source_checkpoint_id TEXT NOT NULL CHECK (length(source_checkpoint_id) BETWEEN 1 AND 128),
 source_digest TEXT NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
 inventory_digest TEXT NOT NULL CHECK (inventory_digest ~ '^[a-f0-9]{64}$'),
 code_content JSONB,
 provenance JSONB NOT NULL CHECK (jsonb_typeof(provenance)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(template_id,source_checkpoint_id,source_digest),
 FOREIGN KEY(template_id,source_tenant_id) REFERENCES page_studio_template_entries(id,owner_tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY(source_tenant_id,source_client_id,source_site_id,source_checkpoint_id)
   REFERENCES page_studio_checkpoints(tenant_id,client_id,site_id,id) ON DELETE RESTRICT,
 CHECK ((format='typed' AND code_content IS NULL) OR (format='code-pages' AND
   COALESCE(jsonb_typeof(code_content)='object' AND code_content->>'kind'='code-pages'
    AND code_content->'formatVersion'='1'::jsonb
    AND jsonb_typeof(code_content->'operationId')='string'
    AND jsonb_typeof(code_content->'indexDigest')='string'
    AND jsonb_typeof(code_content->'contentDigest')='string'
    AND code_content->>'operationId' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    AND code_content->>'indexDigest' ~ '^[a-f0-9]{64}$'
    AND code_content->>'contentDigest' ~ '^[a-f0-9]{64}$'
    AND code_content ?& ARRAY['formatVersion','kind','operationId','indexDigest','contentDigest']
    AND (code_content - ARRAY['formatVersion','kind','operationId','indexDigest','contentDigest'])='{}'::jsonb,FALSE)))
);
CREATE FUNCTION protect_page_studio_template_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'TEMPLATE_VERSION_IMMUTABLE';
END $$;
CREATE TRIGGER page_studio_template_version_immutable BEFORE UPDATE OR DELETE ON page_studio_template_versions
 FOR EACH ROW EXECUTE FUNCTION protect_page_studio_template_version();
CREATE TABLE page_studio_template_version_status (
 version_id UUID PRIMARY KEY REFERENCES page_studio_template_versions(id) ON DELETE RESTRICT,
 withdrawn_at TIMESTAMPTZ,
 published_eligible BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE page_studio_template_grants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 template_id UUID NOT NULL REFERENCES page_studio_template_entries(id) ON DELETE RESTRICT,
 audience TEXT NOT NULL CHECK (audience IN ('portal-client','customer-workspace','published-page-studio')),
 tenant_id TEXT, client_id UUID REFERENCES agency_clients(id) ON DELETE RESTRICT,
 workspace_id UUID REFERENCES page_studio_customer_workspaces(id) ON DELETE RESTRICT,
 effective_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
 CHECK (expires_at IS NULL OR expires_at>effective_from),
 CHECK ((audience='portal-client' AND tenant_id IS NOT NULL AND length(btrim(tenant_id)) BETWEEN 1 AND 200 AND client_id IS NOT NULL AND workspace_id IS NULL)
   OR (audience='customer-workspace' AND tenant_id IS NULL AND client_id IS NULL AND workspace_id IS NOT NULL)
   OR (audience='published-page-studio' AND tenant_id IS NULL AND client_id IS NULL AND workspace_id IS NULL))
);
CREATE INDEX page_studio_template_grants_portal ON page_studio_template_grants(tenant_id,client_id,template_id) WHERE revoked_at IS NULL;
CREATE INDEX page_studio_template_grants_customer ON page_studio_template_grants(workspace_id,template_id) WHERE revoked_at IS NULL;
CREATE INDEX page_studio_template_versions_entry ON page_studio_template_versions(template_id,id);
COMMIT;
