-- Immutable public-preview receipts and resumable destination-owned copies.
BEGIN;
CREATE TABLE page_studio_template_previews (
 version_id UUID PRIMARY KEY REFERENCES page_studio_template_versions(id) ON DELETE RESTRICT,
 snapshot_id UUID NOT NULL REFERENCES page_studio_staging_deployments(id) ON DELETE RESTRICT,
 hostname TEXT NOT NULL UNIQUE,
 artifact_prefix TEXT NOT NULL,
 manifest_digest TEXT NOT NULL CHECK(manifest_digest ~ '^[a-f0-9]{64}$'),
 published_by UUID NOT NULL REFERENCES team_members(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER page_studio_template_preview_immutable BEFORE UPDATE OR DELETE ON page_studio_template_previews
 FOR EACH ROW EXECUTE FUNCTION protect_page_studio_template_version();
CREATE TRIGGER page_studio_template_preview_no_truncate BEFORE TRUNCATE ON page_studio_template_previews
 FOR EACH STATEMENT EXECUTE FUNCTION protect_page_studio_template_version();
CREATE TABLE page_studio_template_copies (
 id UUID PRIMARY KEY,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('agency','portal','customer')),
 actor_id UUID NOT NULL,
 account_key TEXT NOT NULL,
 version_id UUID NOT NULL REFERENCES page_studio_template_versions(id) ON DELETE RESTRICT,
 tenant_id TEXT NOT NULL, client_id UUID NOT NULL, site_id UUID NOT NULL UNIQUE,
 request_payload JSONB NOT NULL,
 base_checkpoint_id TEXT NOT NULL UNIQUE, checkpoint_id TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','ready')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id) ON DELETE RESTRICT
);
COMMIT;
