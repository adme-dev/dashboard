-- Atomic intent only. Dispatch revalidates the immutable audit's original
-- authority through the private management service; this table is not a grant.
-- No historical backfill, provider calls, quota admission or publication.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_checkpoint_staging_outbox (
  audit_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  checkpoint_id TEXT NOT NULL,
  checkpoint_digest CHAR(64) NOT NULL CHECK (checkpoint_digest ~ '^[a-f0-9]{64}$'),
  environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','completed','stopped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  claim_token UUID,
  claim_until TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('READY','FAILED','SUSPENDED','EXHAUSTED','PENDING',
    'STAGING_INVALID','STAGING_ACCESS_DENIED','STAGING_CHANGED','STAGING_BUSY','STAGING_BUILD_LIMIT','STAGING_SERVICE_UNAVAILABLE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  finished_at TIMESTAMPTZ,
  CHECK ((state='leased') = (claim_token IS NOT NULL AND claim_until IS NOT NULL)),
  CHECK ((claim_token IS NULL) = (claim_until IS NULL)),
  CHECK ((state IN ('completed','stopped')) = (finished_at IS NOT NULL)),
  CHECK (state NOT IN ('completed','stopped') OR outcome IS NOT NULL),
  CHECK (state<>'completed' OR outcome='READY'),
  CHECK (state<>'stopped' OR outcome<>'READY'),
  FOREIGN KEY (tenant_id,client_id,site_id,audit_id)
    REFERENCES page_studio_audit_events(tenant_id,client_id,site_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,client_id,site_id,checkpoint_id)
    REFERENCES page_studio_checkpoints(tenant_id,client_id,site_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_page_studio_checkpoint_staging_pending
  ON page_studio_checkpoint_staging_outbox(environment,available_at,created_at)
  WHERE state IN ('pending','leased');

CREATE OR REPLACE FUNCTION protect_page_studio_checkpoint_staging_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' OR
    ROW(NEW.audit_id,NEW.tenant_id,NEW.client_id,NEW.site_id,NEW.checkpoint_id,NEW.checkpoint_digest,NEW.environment,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.audit_id,OLD.tenant_id,OLD.client_id,OLD.site_id,OLD.checkpoint_id,OLD.checkpoint_digest,OLD.environment,OLD.created_at)
    OR (OLD.state IN ('completed','stopped') AND NEW IS DISTINCT FROM OLD)
    OR NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 THEN
    RAISE EXCEPTION 'CHECKPOINT_STAGING_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS page_studio_checkpoint_staging_identity ON page_studio_checkpoint_staging_outbox;
CREATE TRIGGER page_studio_checkpoint_staging_identity BEFORE UPDATE OR DELETE ON page_studio_checkpoint_staging_outbox
  FOR EACH ROW EXECUTE FUNCTION protect_page_studio_checkpoint_staging_identity();

-- All checkpoint writers already insert this append-only event before their
-- final authority check/COMMIT. A rollback removes intent with the checkpoint.
-- Old writers without supported provenance remain valid and enqueue nothing.
CREATE OR REPLACE FUNCTION enqueue_page_studio_checkpoint_staging()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$ BEGIN
  IF NEW.action='workspace.checkpointed' AND NEW.resource_type='checkpoint'
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
DROP TRIGGER IF EXISTS page_studio_checkpoint_staging_enqueue ON page_studio_audit_events;
CREATE TRIGGER page_studio_checkpoint_staging_enqueue AFTER INSERT ON page_studio_audit_events
  FOR EACH ROW EXECUTE FUNCTION enqueue_page_studio_checkpoint_staging();
COMMIT;
