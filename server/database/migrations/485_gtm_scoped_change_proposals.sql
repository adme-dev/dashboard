BEGIN;
CREATE TABLE IF NOT EXISTS gtm_tracking_ownership_evidence (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
 site_id UUID NOT NULL REFERENCES tracking_sites(id) ON DELETE RESTRICT,
 recorded_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 evidence_hash TEXT NOT NULL CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),
 idempotency_key TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '7 days',
 UNIQUE(recorded_by,idempotency_key), UNIQUE(id,site_id,client_id)
);
CREATE TABLE IF NOT EXISTS gtm_change_proposals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
 site_id UUID NOT NULL REFERENCES tracking_sites(id) ON DELETE RESTRICT,
 binding_id UUID REFERENCES gtm_container_bindings(id) ON DELETE RESTRICT,
 connection_id UUID NOT NULL REFERENCES gtm_connections(id) ON DELETE RESTRICT,
 action_type TEXT NOT NULL CHECK(action_type IN ('binding','workspace','installation','publish','rollback')),
 requester_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
 desired_state JSONB NOT NULL,
 state_diff JSONB NOT NULL,
 request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 base_live_path TEXT NOT NULL,
 base_live_fingerprint TEXT NOT NULL,
 ownership_evidence_id UUID NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','rejected','executing','versioned','verified','failed','unknown','cancelled','rolled_back')),
 reviewer_id UUID REFERENCES team_members(id) ON DELETE RESTRICT,
 reviewed_at TIMESTAMPTZ,
 executor_id UUID REFERENCES team_members(id) ON DELETE RESTRICT,
 executed_at TIMESTAMPTZ,
 result JSONB,
 error_code TEXT,
 change_set_id UUID REFERENCES gtm_change_sets(id) ON DELETE RESTRICT,
 idempotency_key TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '1 day',
 CHECK(reviewer_id IS NULL OR reviewer_id<>requester_id),
 FOREIGN KEY(ownership_evidence_id,site_id,client_id) REFERENCES gtm_tracking_ownership_evidence(id,site_id,client_id),
 UNIQUE(requester_id,idempotency_key)
);
ALTER TABLE gtm_change_sets ADD COLUMN IF NOT EXISTS source_proposal_id UUID REFERENCES gtm_change_proposals(id) ON DELETE RESTRICT;
ALTER TABLE gtm_change_sets DROP CONSTRAINT IF EXISTS gtm_change_sets_action_type_check;
ALTER TABLE gtm_change_sets ADD CONSTRAINT gtm_change_sets_action_type_check CHECK(action_type IN ('install_xeroflow','rollback','typed_workspace','reviewed_publish'));
CREATE INDEX IF NOT EXISTS gtm_proposal_review_queue ON gtm_change_proposals(client_id,status,created_at);
CREATE OR REPLACE FUNCTION protect_gtm_proposal_intent() RETURNS TRIGGER AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','reviewer_id','reviewed_at','executor_id','executed_at','result','error_code','change_set_id']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','reviewer_id','reviewed_at','executor_id','executed_at','result','error_code','change_set_id']) THEN
  RAISE EXCEPTION 'GTM proposal intent is immutable';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS gtm_proposal_immutable ON gtm_change_proposals;
CREATE TRIGGER gtm_proposal_immutable BEFORE UPDATE ON gtm_change_proposals FOR EACH ROW EXECUTE FUNCTION protect_gtm_proposal_intent();
CREATE OR REPLACE FUNCTION protect_gtm_ownership_evidence() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'GTM ownership evidence is immutable; record fresh evidence'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS gtm_ownership_immutable ON gtm_tracking_ownership_evidence;
CREATE TRIGGER gtm_ownership_immutable BEFORE UPDATE OR DELETE ON gtm_tracking_ownership_evidence FOR EACH ROW EXECUTE FUNCTION protect_gtm_ownership_evidence();
COMMIT;
