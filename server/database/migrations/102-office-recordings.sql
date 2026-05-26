-- Async screen recordings and viewer analytics for office/meeting artifacts.

CREATE TABLE IF NOT EXISTS office_recordings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id          uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  meeting_session_id uuid REFERENCES office_meeting_sessions(id) ON DELETE SET NULL,
  title              text NOT NULL,
  description        text NOT NULL DEFAULT '',
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','processing','ready','failed','archived')),
  access             text NOT NULL DEFAULT 'workspace'
                     CHECK (access IN ('private','workspace','public','password')),
  storage_key        text,
  thumbnail_key      text,
  duration_seconds   int,
  transcript         text NOT NULL DEFAULT '',
  summary            text NOT NULL DEFAULT '',
  chapters           jsonb NOT NULL DEFAULT '[]'::jsonb,
  share_token        text UNIQUE,
  password_hash      text,
  view_count         int NOT NULL DEFAULT 0,
  created_by         uuid REFERENCES team_members(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_recordings_office
  ON office_recordings(office_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_recordings_meeting
  ON office_recordings(meeting_session_id, created_at DESC)
  WHERE meeting_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_office_recordings_share
  ON office_recordings(share_token)
  WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS office_recording_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id    uuid NOT NULL REFERENCES office_recordings(id) ON DELETE CASCADE,
  viewer_user_id  uuid REFERENCES team_members(id) ON DELETE SET NULL,
  viewer_email    text,
  viewer_key      text,
  percent_watched numeric(5,2) NOT NULL DEFAULT 0,
  watched_seconds int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_recording_views_recording
  ON office_recording_views(recording_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_recording_views_email
  ON office_recording_views(recording_id, lower(viewer_email), created_at DESC)
  WHERE viewer_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_office_recording_views_viewer_key
  ON office_recording_views(recording_id, viewer_key, created_at DESC)
  WHERE viewer_key IS NOT NULL;

CREATE OR REPLACE FUNCTION update_office_recordings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_office_recordings_updated_at ON office_recordings;
CREATE TRIGGER update_office_recordings_updated_at
  BEFORE UPDATE ON office_recordings
  FOR EACH ROW
  EXECUTE FUNCTION update_office_recordings_updated_at();
