-- Release-build identity only. Apply before deploying renderer-aware readers.
-- Do not create Astro rows until old native instances have been retired.
-- Checkpoint staging retains its own deployment/admission; no second build row.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE page_studio_builds
  ADD COLUMN IF NOT EXISTS renderer TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS build_identity JSONB,
  ADD COLUMN IF NOT EXISTS build_identity_digest TEXT,
  ADD COLUMN IF NOT EXISTS compiler_toolchain JSONB;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='page_studio_build_renderer_identity' AND conrelid='page_studio_builds'::regclass) THEN
    ALTER TABLE page_studio_builds ADD CONSTRAINT page_studio_build_renderer_identity CHECK ((
      (renderer='legacy' AND build_identity IS NULL AND build_identity_digest IS NULL AND compiler_toolchain IS NULL)
      OR (renderer='astro' AND build_identity IS NOT NULL AND compiler_toolchain IS NOT NULL
        AND build_identity_digest IS NOT NULL AND build_identity_digest ~ '^[a-f0-9]{64}$'
        AND id='build_astro_' || build_identity_digest
        AND jsonb_typeof(build_identity)='object' AND jsonb_typeof(compiler_toolchain)='object'
        AND build_identity->>'formatVersion'='1' AND build_identity->>'renderer'='astro'
        AND build_identity->>'environment' IN ('staging','production')
        AND build_identity#>>'{scope,tenantId}'=tenant_id
        AND build_identity#>>'{scope,clientId}'=client_id::text
        AND build_identity#>>'{scope,siteId}'=site_id::text
        AND build_identity#>>'{source,kind}'='approved-version'
        AND build_identity#>>'{source,versionId}'=version_id::text
        AND build_identity#>>'{source,versionDigest}'=version_digest::text
        AND build_identity->>'renderInputDigest' ~ '^[a-f0-9]{64}$'
        AND build_identity->>'toolchainDigest' ~ '^[a-f0-9]{64}$'
        AND build_identity ? 'featureRecoveryDigest'
        AND (build_identity->'featureRecoveryDigest'='null'::jsonb OR build_identity->>'featureRecoveryDigest' ~ '^[a-f0-9]{64}$')
        AND compiler_toolchain->>'formatVersion'='1'
        AND compiler_toolchain->>'kind'='astro-compiler-toolchain'
        AND compiler_toolchain->>'hostPolicyDigest' ~ '^[a-f0-9]{64}$'
        AND compiler_toolchain->>'image' ~ '^registry\.cloudflare\.com/[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9._-]*@sha256:[a-f0-9]{64}$')
    ) IS TRUE);
  END IF;
END $$;
-- Maintain historical uniqueness throughout the atomic constraint replacement.
CREATE UNIQUE INDEX IF NOT EXISTS uq_page_studio_legacy_version_build
  ON page_studio_builds(site_id,version_digest) WHERE renderer='legacy';
CREATE UNIQUE INDEX IF NOT EXISTS uq_page_studio_astro_build_identity
  ON page_studio_builds(tenant_id,client_id,site_id,build_identity_digest) WHERE renderer='astro';
ALTER TABLE page_studio_builds DROP CONSTRAINT IF EXISTS page_studio_builds_site_id_version_digest_key;

CREATE OR REPLACE FUNCTION protect_page_studio_astro_build_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.renderer='astro' THEN RAISE EXCEPTION 'ASTRO_BUILD_IDENTITY_IMMUTABLE'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.renderer IS DISTINCT FROM OLD.renderer OR (OLD.renderer='astro' AND
    ROW(NEW.id,NEW.tenant_id,NEW.client_id,NEW.site_id,NEW.version_id,NEW.version_digest,
        NEW.build_identity,NEW.build_identity_digest,NEW.compiler_toolchain,NEW.idempotency_key,NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id,OLD.tenant_id,OLD.client_id,OLD.site_id,OLD.version_id,OLD.version_digest,
        OLD.build_identity,OLD.build_identity_digest,OLD.compiler_toolchain,OLD.idempotency_key,OLD.created_at)) THEN
    RAISE EXCEPTION 'ASTRO_BUILD_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_astro_build_identity_guard ON page_studio_builds;
CREATE TRIGGER page_studio_astro_build_identity_guard BEFORE UPDATE OR DELETE ON page_studio_builds
  FOR EACH ROW EXECUTE FUNCTION protect_page_studio_astro_build_identity();
COMMENT ON COLUMN page_studio_builds.build_identity IS
  'Retained Astro release identity; shared verifier recomputes JSON/toolchain hashes before reuse. Not compiler provenance or publication authority.';
COMMIT;
