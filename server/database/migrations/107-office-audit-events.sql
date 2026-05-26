-- Immutable office audit trail for policy and sensitive operational changes.

CREATE TABLE IF NOT EXISTS office_audit_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id   uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES team_members(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   uuid,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_audit_events_office
  ON office_audit_events(office_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_audit_events_target
  ON office_audit_events(target_type, target_id, created_at DESC)
  WHERE target_id IS NOT NULL;
