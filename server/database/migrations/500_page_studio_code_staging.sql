-- Code imports require explicit native staging and retain their complete identity.
BEGIN;
ALTER TABLE page_studio_staging_deployments ADD COLUMN IF NOT EXISTS code_content JSONB;
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='page_studio_staging_deployments'::regclass AND conname='page_studio_staging_code_content_valid') THEN
ALTER TABLE page_studio_staging_deployments ADD CONSTRAINT page_studio_staging_code_content_valid CHECK (
 code_content IS NULL OR COALESCE((jsonb_typeof(code_content)='object'
 AND jsonb_typeof(code_content->'kind')='string'
 AND jsonb_typeof(code_content->'operationId')='string'
 AND jsonb_typeof(code_content->'indexDigest')='string'
 AND jsonb_typeof(code_content->'contentDigest')='string'
 AND code_content->'formatVersion'='1'::jsonb AND code_content->>'kind'='code-pages'
 AND code_content->>'operationId' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
 AND code_content->>'indexDigest' ~ '^[a-f0-9]{64}$'
 AND code_content->>'contentDigest' ~ '^[a-f0-9]{64}$'
 AND code_content ?& ARRAY['formatVersion','kind','operationId','indexDigest','contentDigest']
 AND (code_content - ARRAY['formatVersion','kind','operationId','indexDigest','contentDigest'])='{}'::jsonb),FALSE));
END IF;
END $$;
CREATE OR REPLACE FUNCTION protect_page_studio_staging_deployment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'DELETE' OR
    ROW(NEW.id,NEW.tenant_id,NEW.client_id,NEW.site_id,NEW.actor_id,NEW.actor_role,NEW.idempotency_key,NEW.checkpoint_id,NEW.checkpoint_digest,NEW.expected_active_id,NEW.created_at,NEW.code_content)
      IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.client_id,OLD.site_id,OLD.actor_id,OLD.actor_role,OLD.idempotency_key,OLD.checkpoint_id,OLD.checkpoint_digest,OLD.expected_active_id,OLD.created_at,OLD.code_content)
    OR (OLD.state IN ('succeeded','failed') AND NEW IS DISTINCT FROM OLD)
    OR (OLD.state='building' AND NEW.state='queued') THEN
    RAISE EXCEPTION 'STAGING_DEPLOYMENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION enqueue_page_studio_checkpoint_staging()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$ BEGIN
  IF NEW.action='workspace.checkpointed' AND NEW.resource_type='checkpoint'
    AND NOT (NEW.metadata ? 'codeContent')
    AND NEW.metadata->>'commitProtocol' IN ('cas-v1','cms-graph-v1')
    AND NEW.metadata->'stagingOrigin'->'formatVersion'='1'::jsonb
    AND NEW.metadata->'stagingOrigin'->>'environment' IN ('staging','production')
    AND NEW.metadata->'stagingOrigin'->>'source' IN ('native-login','studio-session','provisioning')
    AND NEW.tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    AND NEW.resource_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' THEN
    INSERT INTO page_studio_checkpoint_staging_outbox(audit_id,tenant_id,client_id,site_id,checkpoint_id,checkpoint_digest,environment)
      SELECT NEW.id,NEW.tenant_id,NEW.client_id,NEW.site_id,checkpoint.id,checkpoint.digest,
        NEW.metadata->'stagingOrigin'->>'environment'
      FROM page_studio_checkpoints checkpoint
      WHERE checkpoint.tenant_id=NEW.tenant_id AND checkpoint.client_id=NEW.client_id AND checkpoint.site_id=NEW.site_id
        AND checkpoint.id=NEW.resource_id AND checkpoint.digest=NEW.metadata->>'digest';
  END IF;
  RETURN NEW;
END $$;
COMMIT;
