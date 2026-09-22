-- Explicit native metadata installation. Private bytes and execution grants are
-- separate: a seal is recovery evidence; activation is tied to one pointer epoch.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_release_feature_seals (
  scope_key TEXT NOT NULL,
  build_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  version_id TEXT NOT NULL,
  version_digest TEXT NOT NULL CHECK (version_digest ~ '^[a-f0-9]{64}$'),
  manifest_digest TEXT NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  seal_digest TEXT NOT NULL CHECK (seal_digest ~ '^[a-f0-9]{64}$'),
  recovery_key TEXT NOT NULL CHECK (recovery_key ~ '^builder-recovery/v1/[a-f0-9]{64}/[a-f0-9]{64}/[a-f0-9]{64}\.json$'),
  recovery_bytes INTEGER NOT NULL CHECK (recovery_bytes BETWEEN 1 AND 8000000),
  identity JSONB NOT NULL CHECK (jsonb_typeof(identity)='object'),
  publisher JSONB NOT NULL CHECK (jsonb_typeof(publisher)='object'),
  audit_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_key,build_id),
  UNIQUE(tenant_id,client_id,site_id,build_id)
);
CREATE TABLE IF NOT EXISTS page_studio_release_feature_activations (
  id UUID PRIMARY KEY,
  scope_key TEXT NOT NULL,
  build_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
  hostname TEXT NOT NULL CHECK(length(hostname) BETWEEN 1 AND 253 AND hostname=lower(hostname)),
  pointer_version BIGINT NOT NULL CHECK(pointer_version>0),
  release_id TEXT NOT NULL,
  seal_digest TEXT NOT NULL CHECK(seal_digest ~ '^[a-f0-9]{64}$'),
  identity JSONB NOT NULL CHECK(jsonb_typeof(identity)='object'),
  state TEXT NOT NULL DEFAULT 'enabled' CHECK(state IN ('enabled','revoked')),
  audit_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(environment,hostname,pointer_version),
  FOREIGN KEY(scope_key,build_id) REFERENCES page_studio_release_feature_seals(scope_key,build_id),
  CHECK((state='enabled' AND revoked_at IS NULL) OR (state='revoked' AND revoked_at IS NOT NULL))
);
CREATE OR REPLACE FUNCTION page_studio_feature_seal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RELEASE_FEATURE_SEAL_IMMUTABLE';
END $$;
DROP TRIGGER IF EXISTS page_studio_feature_seal_immutable ON page_studio_release_feature_seals;
CREATE TRIGGER page_studio_feature_seal_immutable BEFORE UPDATE OR DELETE ON page_studio_release_feature_seals FOR EACH ROW EXECUTE FUNCTION page_studio_feature_seal_immutable();
CREATE OR REPLACE FUNCTION page_studio_feature_activation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR ROW(NEW.id,NEW.scope_key,NEW.build_id,NEW.environment,NEW.hostname,NEW.pointer_version,NEW.release_id,NEW.seal_digest,NEW.identity,NEW.audit_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.scope_key,OLD.build_id,OLD.environment,OLD.hostname,OLD.pointer_version,OLD.release_id,OLD.seal_digest,OLD.identity,OLD.audit_id,OLD.created_at)
    OR (OLD.state='revoked' AND ROW(NEW.state,NEW.revoked_at) IS DISTINCT FROM ROW(OLD.state,OLD.revoked_at))
    OR (OLD.state='enabled' AND NEW.state='enabled' AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'RELEASE_FEATURE_ACTIVATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_feature_activation_immutable ON page_studio_release_feature_activations;
CREATE TRIGGER page_studio_feature_activation_immutable BEFORE UPDATE OR DELETE ON page_studio_release_feature_activations FOR EACH ROW EXECUTE FUNCTION page_studio_feature_activation_immutable();
COMMIT;
