-- Persist requested meeting times for scheduled public lobbies.

ALTER TABLE office_lobby_requests
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_office_lobby_requests_scheduled_start
  ON office_lobby_requests(office_id, scheduled_start_at)
  WHERE scheduled_start_at IS NOT NULL;
