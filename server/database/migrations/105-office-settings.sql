-- Office-level policy controls for guests, recordings, retention, and assistant automation.

CREATE TABLE IF NOT EXISTS office_settings (
  office_id uuid PRIMARY KEY REFERENCES offices(id) ON DELETE CASCADE,
  guest_access_enabled boolean NOT NULL DEFAULT true,
  public_lobbies_enabled boolean NOT NULL DEFAULT true,
  recording_enabled boolean NOT NULL DEFAULT true,
  public_recording_links_enabled boolean NOT NULL DEFAULT false,
  ai_notes_enabled boolean NOT NULL DEFAULT true,
  assistant_enabled boolean NOT NULL DEFAULT true,
  default_meeting_retention_days int NOT NULL DEFAULT 90 CHECK (default_meeting_retention_days BETWEEN 1 AND 3650),
  default_recording_retention_days int NOT NULL DEFAULT 180 CHECK (default_recording_retention_days BETWEEN 1 AND 3650),
  require_recording_consent boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_settings_updated
  ON office_settings(updated_at DESC);
