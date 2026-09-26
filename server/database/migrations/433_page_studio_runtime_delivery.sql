-- Astro runtime delivery (Studio ADR-005). Additive: every existing site stays
-- 'static' and every existing release keeps its build. A runtime release pins an
-- exact approved version instead of a compiled build; it never fabricates one.
BEGIN;

ALTER TABLE page_studio_sites
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'static';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_page_studio_sites_delivery_mode' AND conrelid = 'page_studio_sites'::regclass) THEN
    ALTER TABLE page_studio_sites ADD CONSTRAINT ck_page_studio_sites_delivery_mode
      CHECK (delivery_mode IN ('static', 'runtime'));
  END IF;
END $$;

ALTER TABLE page_studio_releases ALTER COLUMN build_id DROP NOT NULL;
ALTER TABLE page_studio_releases
  ADD COLUMN IF NOT EXISTS runtime_release JSONB,
  ADD COLUMN IF NOT EXISTS runtime_release_digest CHAR(64),
  ADD COLUMN IF NOT EXISTS runtime_version_id UUID,
  ADD COLUMN IF NOT EXISTS runtime_version_digest CHAR(64),
  ADD COLUMN IF NOT EXISTS release_metadata JSONB;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_page_studio_releases_delivery' AND conrelid = 'page_studio_releases'::regclass) THEN
    -- Exactly one delivery source. Runtime columns are all-or-nothing and the
    -- stored reference must name this row's own scope, environment and version.
    ALTER TABLE page_studio_releases ADD CONSTRAINT ck_page_studio_releases_delivery CHECK (
      (build_id IS NOT NULL AND runtime_release IS NULL AND runtime_release_digest IS NULL
        AND runtime_version_id IS NULL AND runtime_version_digest IS NULL AND release_metadata IS NULL)
      OR (build_id IS NULL AND environment IN ('staging', 'production')
        AND runtime_release_digest ~ '^[a-f0-9]{64}$'
        AND runtime_version_digest ~ '^[a-f0-9]{64}$'
        AND runtime_version_id IS NOT NULL
        AND jsonb_typeof(runtime_release) = 'object'
        AND runtime_release->>'delivery' = 'runtime'
        AND runtime_release->>'environment' = environment
        AND runtime_release->>'versionDigest' = runtime_version_digest
        AND runtime_release->'scope'->>'tenantId' = tenant_id
        AND runtime_release->'scope'->>'clientId' = client_id::text
        AND runtime_release->'scope'->>'siteId' = site_id::text
        AND (release_metadata IS NULL OR jsonb_typeof(release_metadata) = 'object'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_page_studio_releases_runtime_version' AND conrelid = 'page_studio_releases'::regclass) THEN
    ALTER TABLE page_studio_releases ADD CONSTRAINT fk_page_studio_releases_runtime_version
      FOREIGN KEY (tenant_id, client_id, site_id, runtime_version_id, runtime_version_digest)
      REFERENCES page_studio_versions(tenant_id, client_id, site_id, id, digest) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_page_studio_runtime_release_identity
  ON page_studio_releases (tenant_id, client_id, site_id, environment, normalized_hostname, runtime_release_digest)
  WHERE runtime_release_digest IS NOT NULL;

-- A runtime release is an immutable record: rollback re-points to it by id.
CREATE OR REPLACE FUNCTION protect_page_studio_runtime_release()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.runtime_release IS NOT NULL THEN RAISE EXCEPTION 'RUNTIME_RELEASE_IMMUTABLE'; END IF;
    RETURN OLD;
  END IF;
  IF ROW(OLD.build_id, OLD.runtime_release, OLD.runtime_release_digest, OLD.runtime_version_id,
         OLD.runtime_version_digest, OLD.release_metadata, OLD.environment, OLD.normalized_hostname)
     IS DISTINCT FROM
     ROW(NEW.build_id, NEW.runtime_release, NEW.runtime_release_digest, NEW.runtime_version_id,
         NEW.runtime_version_digest, NEW.release_metadata, NEW.environment, NEW.normalized_hostname)
     AND (OLD.runtime_release IS NOT NULL OR NEW.runtime_release IS NOT NULL) THEN
    RAISE EXCEPTION 'RUNTIME_RELEASE_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_runtime_release_immutable ON page_studio_releases;
CREATE TRIGGER page_studio_runtime_release_immutable BEFORE UPDATE OR DELETE ON page_studio_releases
  FOR EACH ROW EXECUTE FUNCTION protect_page_studio_runtime_release();

-- Site metadata restoration (414) now also follows runtime releases.
CREATE OR REPLACE FUNCTION page_studio_apply_release_metadata()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_metadata JSONB;
  target_version_id UUID;
  target_checkpoint_id TEXT;
  retained_integrations JSONB := '{}'::jsonb;
BEGIN
  IF NEW.current_release_id IS NOT DISTINCT FROM OLD.current_release_id
    OR NEW.current_release_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(build.release_metadata, release.release_metadata),
    version.id,
    version.checkpoint_id
  INTO
    target_metadata,
    target_version_id,
    target_checkpoint_id
  FROM page_studio_releases AS release
  LEFT JOIN page_studio_builds AS build
    ON build.id = release.build_id
   AND build.tenant_id = release.tenant_id
   AND build.client_id = release.client_id
   AND build.site_id = release.site_id
  INNER JOIN page_studio_versions AS version
    ON version.id = COALESCE(build.version_id, release.runtime_version_id)
   AND version.tenant_id = release.tenant_id
   AND version.client_id = release.client_id
   AND version.site_id = release.site_id
  WHERE release.id = NEW.current_release_id
    AND release.tenant_id = NEW.tenant_id
    AND release.client_id = NEW.client_id
    AND release.site_id = NEW.id
  LIMIT 1;

  IF target_metadata IS NULL OR target_metadata = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(target_metadata) <> 'object'
    OR jsonb_typeof(target_metadata->'theme') <> 'object'
    OR jsonb_typeof(target_metadata->'navigation') <> 'object'
    OR jsonb_typeof(target_metadata->'footer') <> 'object'
    OR jsonb_typeof(target_metadata->'seoDefaults') <> 'object'
    OR jsonb_typeof(target_metadata->'integrations') <> 'object'
    OR jsonb_typeof(target_metadata->'defaultLocale') <> 'string' THEN
    RAISE EXCEPTION 'Page Studio release % has invalid release metadata', NEW.current_release_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(OLD.integrations, '{}'::jsonb) ? 'synthetic' THEN
    retained_integrations := jsonb_build_object('synthetic', OLD.integrations->'synthetic');
  END IF;

  NEW.current_version_id := target_version_id;
  NEW.current_checkpoint_id := target_checkpoint_id;
  NEW.default_locale := target_metadata->>'defaultLocale';
  NEW.theme := target_metadata->'theme';
  NEW.navigation := target_metadata->'navigation';
  NEW.footer := target_metadata->'footer';
  NEW.seo_defaults := target_metadata->'seoDefaults';
  NEW.integrations := (target_metadata->'integrations') || retained_integrations;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

-- Save on a runtime site records a draft only: it must not queue a static
-- staging build (429). Static sites keep the existing behaviour.
CREATE OR REPLACE FUNCTION enqueue_page_studio_checkpoint_staging()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$ BEGIN
  IF NEW.action='workspace.checkpointed' AND NEW.resource_type='checkpoint'
    AND NEW.metadata->>'commitProtocol' IN ('cas-v1','cms-graph-v1')
    AND NEW.metadata->'stagingOrigin'->'formatVersion'='1'::jsonb
    AND NEW.metadata->'stagingOrigin'->>'environment' IN ('staging','production')
    AND NEW.metadata->'stagingOrigin'->>'source' IN ('native-login','studio-session','provisioning')
    AND NEW.tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    AND NEW.resource_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    AND NOT EXISTS (
      SELECT 1 FROM page_studio_sites site
      WHERE site.tenant_id=NEW.tenant_id AND site.client_id=NEW.client_id AND site.id=NEW.site_id
        AND site.delivery_mode='runtime') THEN
    INSERT INTO page_studio_checkpoint_staging_outbox(audit_id,tenant_id,client_id,site_id,checkpoint_id,checkpoint_digest,environment)
      SELECT NEW.id,NEW.tenant_id,NEW.client_id,NEW.site_id,checkpoint.id,checkpoint.digest,
        NEW.metadata->'stagingOrigin'->>'environment'
      FROM page_studio_checkpoints checkpoint
      WHERE checkpoint.tenant_id=NEW.tenant_id AND checkpoint.client_id=NEW.client_id AND checkpoint.site_id=NEW.site_id
        AND checkpoint.id=NEW.resource_id AND checkpoint.digest=NEW.metadata->>'digest';
  END IF;
  RETURN NEW;
END $$;

-- Jobs queued or leased before a site switched to runtime delivery must not
-- promote a static snapshot afterwards; enforce at activation, not only enqueue.
CREATE OR REPLACE FUNCTION check_page_studio_staging_activation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.active_deployment_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.active_deployment_id IS DISTINCT FROM OLD.active_deployment_id) THEN
    IF NEW.host_state <> 'ready' OR NOT EXISTS (
      SELECT 1 FROM page_studio_staging_deployments deployment
      WHERE deployment.tenant_id=NEW.tenant_id AND deployment.client_id=NEW.client_id AND deployment.site_id=NEW.site_id
        AND deployment.id=NEW.active_deployment_id AND deployment.state='succeeded'
    ) THEN RAISE EXCEPTION 'STAGING_SNAPSHOT_NOT_READY'; END IF;
    IF EXISTS (
      SELECT 1 FROM page_studio_sites site
      WHERE site.tenant_id=NEW.tenant_id AND site.client_id=NEW.client_id AND site.id=NEW.site_id
        AND site.delivery_mode='runtime'
    ) THEN RAISE EXCEPTION 'STAGING_RUNTIME_DELIVERY'; END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
