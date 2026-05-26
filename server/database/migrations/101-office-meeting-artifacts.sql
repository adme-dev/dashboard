-- Meeting sessions and artifacts for office rooms, lobbies, notes, and recordings.

CREATE TABLE IF NOT EXISTS office_meeting_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id           uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  zone_id             uuid REFERENCES office_zones(id) ON DELETE SET NULL,
  lobby_request_id    uuid REFERENCES office_lobby_requests(id) ON DELETE SET NULL,
  lobby_id            uuid REFERENCES office_lobbies(id) ON DELETE SET NULL,
  source              text NOT NULL DEFAULT 'drop_in'
                      CHECK (source IN ('drop_in','lobby','scheduled')),
  status              text NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned','live','ended','cancelled')),
  title               text NOT NULL,
  participant_handles text[] NOT NULL DEFAULT '{}'::text[],
  guest_emails        text[] NOT NULL DEFAULT '{}'::text[],
  consent             jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_days      int,
  started_at          timestamptz,
  ended_at            timestamptz,
  created_by          uuid REFERENCES team_members(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_meeting_sessions_office
  ON office_meeting_sessions(office_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_meeting_sessions_zone
  ON office_meeting_sessions(zone_id, created_at DESC)
  WHERE zone_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS office_meeting_artifacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_session_id uuid NOT NULL REFERENCES office_meeting_sessions(id) ON DELETE CASCADE,
  artifact_type      text NOT NULL
                     CHECK (artifact_type IN ('transcript','summary','recording','action_items','notes')),
  title              text NOT NULL,
  content            text NOT NULL DEFAULT '',
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         uuid REFERENCES team_members(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_meeting_artifacts_session
  ON office_meeting_artifacts(meeting_session_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_office_meeting_sessions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_office_meeting_sessions_updated_at ON office_meeting_sessions;
CREATE TRIGGER update_office_meeting_sessions_updated_at
  BEFORE UPDATE ON office_meeting_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_office_meeting_sessions_updated_at();
