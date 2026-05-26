import { execute, queryOne } from '~~/server/utils/db'
import type { OfficeSettingsRow } from '~~/app/types/office'

let ensurePromise: Promise<void> | null = null

export const DEFAULT_OFFICE_SETTINGS = {
  guest_access_enabled: true,
  public_lobbies_enabled: true,
  recording_enabled: true,
  public_recording_links_enabled: false,
  ai_notes_enabled: true,
  assistant_enabled: true,
  default_meeting_retention_days: 90,
  default_recording_retention_days: 180,
  require_recording_consent: true
} as const

export function ensureOfficeSettingsTable() {
  ensurePromise ??= ensureOfficeSettingsTableOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeSettingsTableOnce() {
  await execute(`
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
    )
  `)
  await execute(`
    ALTER TABLE office_settings
      ADD COLUMN IF NOT EXISTS guest_access_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS public_lobbies_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS public_recording_links_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS ai_notes_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS assistant_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS default_meeting_retention_days int NOT NULL DEFAULT 90,
      ADD COLUMN IF NOT EXISTS default_recording_retention_days int NOT NULL DEFAULT 180,
      ADD COLUMN IF NOT EXISTS require_recording_consent boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES team_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
  await execute(`
    ALTER TABLE office_settings
      DROP CONSTRAINT IF EXISTS office_settings_default_meeting_retention_days_check,
      DROP CONSTRAINT IF EXISTS office_settings_default_recording_retention_days_check
  `)
  await execute(`
    ALTER TABLE office_settings
      ADD CONSTRAINT office_settings_default_meeting_retention_days_check
        CHECK (default_meeting_retention_days BETWEEN 1 AND 3650),
      ADD CONSTRAINT office_settings_default_recording_retention_days_check
        CHECK (default_recording_retention_days BETWEEN 1 AND 3650)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_settings_updated
      ON office_settings(updated_at DESC)
  `)
}

export async function getOfficeSettings(officeId: string) {
  await ensureOfficeSettingsTable()

  const settings = await queryOne<OfficeSettingsRow>(
    `INSERT INTO office_settings (office_id)
     VALUES ($1)
     ON CONFLICT (office_id) DO NOTHING
     RETURNING *`,
    [officeId]
  )

  return settings ?? await queryOne<OfficeSettingsRow>(
    `SELECT * FROM office_settings WHERE office_id = $1`,
    [officeId]
  )
}

export function isPublicRecordingAccess(access: string) {
  return access === 'public' || access === 'password'
}
