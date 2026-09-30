-- Runtime CMS recovery and activation have no static build identity. Immutable
-- recovery is retained per release; permission is specific to one pointer epoch.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_runtime_feature_seals (
  release_id UUID PRIMARY KEY REFERENCES page_studio_releases(id),
  scope_key TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  release_digest TEXT NOT NULL CHECK (release_digest ~ '^[a-f0-9]{64}$'),
  identity JSONB NOT NULL CHECK (jsonb_typeof(identity)='object'),
  publisher JSONB NOT NULL CHECK (jsonb_typeof(publisher)='object'),
  audit_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,client_id,site_id,release_id)
);
CREATE TABLE IF NOT EXISTS page_studio_runtime_feature_activations (
  id UUID PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES page_studio_runtime_feature_seals(release_id),
  environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
  hostname TEXT NOT NULL CHECK (length(hostname) BETWEEN 1 AND 253 AND hostname=lower(hostname)),
  pointer_version BIGINT NOT NULL CHECK (pointer_version>0),
  identity JSONB NOT NULL CHECK (jsonb_typeof(identity)='object'),
  state TEXT NOT NULL DEFAULT 'enabled' CHECK (state IN ('enabled','revoked')),
  revoked_at TIMESTAMPTZ,
  audit_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(environment,hostname,pointer_version),
  CHECK ((state='enabled' AND revoked_at IS NULL) OR (state='revoked' AND revoked_at IS NOT NULL))
);
CREATE OR REPLACE FUNCTION page_studio_runtime_feature_seal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RUNTIME_FEATURE_SEAL_IMMUTABLE';
END $$;
DROP TRIGGER IF EXISTS page_studio_runtime_feature_seal_immutable ON page_studio_runtime_feature_seals;
CREATE TRIGGER page_studio_runtime_feature_seal_immutable BEFORE UPDATE OR DELETE ON page_studio_runtime_feature_seals
  FOR EACH ROW EXECUTE FUNCTION page_studio_runtime_feature_seal_immutable();
CREATE OR REPLACE FUNCTION page_studio_runtime_feature_activation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RUNTIME_FEATURE_ACTIVATION_IMMUTABLE'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','revoked_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revoked_at'])
    OR (OLD.state='revoked' AND ROW(NEW.state,NEW.revoked_at) IS DISTINCT FROM ROW(OLD.state,OLD.revoked_at))
    OR (OLD.state='enabled' AND NEW.state='enabled' AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'RUNTIME_FEATURE_ACTIVATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_runtime_feature_activation_immutable ON page_studio_runtime_feature_activations;
CREATE TRIGGER page_studio_runtime_feature_activation_immutable BEFORE UPDATE OR DELETE ON page_studio_runtime_feature_activations
  FOR EACH ROW EXECUTE FUNCTION page_studio_runtime_feature_activation_immutable();
COMMIT;
