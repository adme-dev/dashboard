-- =============================================================================
-- Virtual Office Lobby Requests
-- Persist external guest prejoin requests so office hosts can triage them.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS office_lobby_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  zone_id         uuid REFERENCES office_zones(id) ON DELETE SET NULL,
  guest_name      text NOT NULL,
  guest_email     text NOT NULL,
  message         text NOT NULL DEFAULT '',
  scheduled_start_at timestamptz,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined','expired')),
  notification_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  handled_by      uuid,
  handled_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_lobby_requests_office_status
  ON office_lobby_requests(office_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_lobby_requests_zone
  ON office_lobby_requests(zone_id, created_at DESC)
  WHERE zone_id IS NOT NULL;

DO $$ BEGIN
  CREATE TRIGGER update_office_lobby_requests_updated_at
    BEFORE UPDATE ON office_lobby_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
