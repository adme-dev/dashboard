import { randomBytes } from 'node:crypto'
import { execute } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'

let ensurePromise: Promise<void> | null = null

export function generateOfficeRecordingShareToken() {
  return randomBytes(18).toString('base64url')
}

export function ensureOfficeRecordingsTables() {
  ensurePromise ??= ensureOfficeRecordingsTablesOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeRecordingsTablesOnce() {
  await ensureOfficeMeetingArtifactsTables()
  await execute(`
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
      retention_days     int CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650),
      share_token        text UNIQUE,
      password_hash      text,
      view_count         int NOT NULL DEFAULT 0,
      created_by         uuid REFERENCES team_members(id) ON DELETE SET NULL,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_recordings
      ADD COLUMN IF NOT EXISTS retention_days int,
      ADD COLUMN IF NOT EXISTS thumbnail_key text,
      ADD COLUMN IF NOT EXISTS transcript text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS share_token text,
      ADD COLUMN IF NOT EXISTS password_hash text,
      ADD COLUMN IF NOT EXISTS view_count int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
  await execute(`
    ALTER TABLE office_recordings
      DROP CONSTRAINT IF EXISTS office_recordings_retention_days_check
  `)
  await execute(`
    ALTER TABLE office_recordings
      ADD CONSTRAINT office_recordings_retention_days_check
      CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_recordings_office
      ON office_recordings(office_id, created_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_recordings_meeting
      ON office_recordings(meeting_session_id, created_at DESC)
      WHERE meeting_session_id IS NOT NULL
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_recordings_share
      ON office_recordings(share_token)
      WHERE share_token IS NOT NULL
  `)
  await execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_office_recordings_share_unique
      ON office_recordings(share_token)
      WHERE share_token IS NOT NULL
  `)
  await execute(`
    CREATE TABLE IF NOT EXISTS office_recording_views (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recording_id    uuid NOT NULL REFERENCES office_recordings(id) ON DELETE CASCADE,
      viewer_user_id  uuid REFERENCES team_members(id) ON DELETE SET NULL,
      viewer_email    text,
      viewer_key      text,
      percent_watched numeric(5,2) NOT NULL DEFAULT 0,
      watched_seconds int NOT NULL DEFAULT 0,
      created_at      timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_recording_views
      ADD COLUMN IF NOT EXISTS viewer_key text,
      ADD COLUMN IF NOT EXISTS percent_watched numeric(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS watched_seconds int NOT NULL DEFAULT 0
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_recording_views_recording
      ON office_recording_views(recording_id, created_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_recording_views_email
      ON office_recording_views(recording_id, lower(viewer_email), created_at DESC)
      WHERE viewer_email IS NOT NULL
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_recording_views_viewer_key
      ON office_recording_views(recording_id, viewer_key, created_at DESC)
      WHERE viewer_key IS NOT NULL
  `)
}
