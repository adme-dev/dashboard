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
    build.release_metadata,
    version.id,
    version.checkpoint_id
  INTO
    target_metadata,
    target_version_id,
    target_checkpoint_id
  FROM page_studio_releases AS release
  INNER JOIN page_studio_builds AS build
    ON build.id = release.build_id
   AND build.tenant_id = release.tenant_id
   AND build.client_id = release.client_id
   AND build.site_id = release.site_id
  INNER JOIN page_studio_versions AS version
    ON version.id = build.version_id
   AND version.tenant_id = build.tenant_id
   AND version.client_id = build.client_id
   AND version.site_id = build.site_id
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

DROP TRIGGER IF EXISTS page_studio_sites_apply_release_metadata ON page_studio_sites;

CREATE TRIGGER page_studio_sites_apply_release_metadata
BEFORE UPDATE OF current_release_id ON page_studio_sites
FOR EACH ROW
EXECUTE FUNCTION page_studio_apply_release_metadata();

COMMENT ON FUNCTION page_studio_apply_release_metadata() IS
  'Atomically restores immutable manifest-derived site metadata when a Page Studio release is activated or rolled back.';

