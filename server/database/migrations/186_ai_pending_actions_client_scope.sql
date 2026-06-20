-- 186_ai_pending_actions_client_scope.sql
-- Phase 3 (portal-agent spec §9): tenant-tag portal write proposals. ai_action_audit already carries
-- client_scope (mig 181); ai_pending_actions does not. Add it so a portal proposal/confirm is bound to
-- the client (= agency_clients.id). Agency rows leave it null. Additive.

ALTER TABLE ai_pending_actions ADD COLUMN IF NOT EXISTS client_scope UUID;

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_client_scope
  ON ai_pending_actions(client_scope) WHERE client_scope IS NOT NULL;
