-- Track which persistent lobby link produced each guest request.

ALTER TABLE office_lobby_requests
  ADD COLUMN IF NOT EXISTS lobby_id uuid REFERENCES office_lobbies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_office_lobby_requests_lobby
  ON office_lobby_requests(lobby_id, status, created_at DESC)
  WHERE lobby_id IS NOT NULL;
