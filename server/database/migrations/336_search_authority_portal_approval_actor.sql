-- Attribute content approvals to either an agency team member or a client portal user.

BEGIN;

ALTER TABLE search_authority_approval_decisions
  ALTER COLUMN decided_by DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS decided_by_client_user_id UUID REFERENCES client_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'agency';

ALTER TABLE search_authority_approval_decisions
  DROP CONSTRAINT IF EXISTS search_authority_approval_decisions_actor_check;
ALTER TABLE search_authority_approval_decisions
  ADD CONSTRAINT search_authority_approval_decisions_actor_check CHECK (
    (actor_type = 'agency' AND decided_by IS NOT NULL AND decided_by_client_user_id IS NULL)
    OR
    (actor_type = 'portal' AND decided_by IS NULL AND decided_by_client_user_id IS NOT NULL)
  );

ALTER TABLE search_authority_content_audit_events
  ALTER COLUMN actor_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS actor_client_user_id UUID REFERENCES client_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'agency';

ALTER TABLE search_authority_content_audit_events
  DROP CONSTRAINT IF EXISTS search_authority_content_audit_events_actor_check;
ALTER TABLE search_authority_content_audit_events
  ADD CONSTRAINT search_authority_content_audit_events_actor_check CHECK (
    (actor_type = 'agency' AND actor_id IS NOT NULL AND actor_client_user_id IS NULL)
    OR
    (actor_type = 'portal' AND actor_id IS NULL AND actor_client_user_id IS NOT NULL)
  );

COMMIT;
