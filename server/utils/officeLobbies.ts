import { execute } from '~~/server/utils/db'

let ensurePromise: Promise<void> | null = null

export function normalizeOfficeLobbyHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function ensureOfficeLobbiesTable() {
  ensurePromise ??= ensureOfficeLobbiesTableOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeLobbiesTableOnce() {
  await execute(`
    CREATE TABLE IF NOT EXISTS office_lobbies (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      office_id           uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      owner_user_id       uuid REFERENCES team_members(id) ON DELETE SET NULL,
      handle              text NOT NULL,
      name                text NOT NULL,
      description         text NOT NULL DEFAULT '',
      destination_zone_id uuid REFERENCES office_zones(id) ON DELETE SET NULL,
      is_active           boolean NOT NULL DEFAULT true,
      config              jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT office_lobbies_handle_format CHECK (handle ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
    )
  `)
  await execute(`
    ALTER TABLE office_lobbies
      ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS destination_zone_id uuid REFERENCES office_zones(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
  await execute(`
    DROP INDEX IF EXISTS idx_office_lobbies_handle
  `)
  await execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_office_lobbies_handle
      ON office_lobbies(lower(handle))
      WHERE is_active = true
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_lobbies_office
      ON office_lobbies(office_id, is_active, created_at DESC)
  `)
}
