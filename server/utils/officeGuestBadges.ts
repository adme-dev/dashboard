import { execute, queryOne } from '~~/server/utils/db'
import { ensureOfficeLobbyRequestsTable } from '~~/server/utils/officeLobbyRequests'
import type { OfficeGuestBadgeRow } from '~~/app/types/office'

let ensurePromise: Promise<void> | null = null

export function ensureOfficeGuestBadgesTable() {
  ensurePromise ??= ensureOfficeGuestBadgesTableOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeGuestBadgesTableOnce() {
  await ensureOfficeLobbyRequestsTable()
  await execute(`
    CREATE TABLE IF NOT EXISTS office_guest_badges (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      office_id        uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      lobby_request_id uuid UNIQUE REFERENCES office_lobby_requests(id) ON DELETE SET NULL,
      guest_name       text NOT NULL,
      guest_email      text NOT NULL,
      allowed_zone_id  uuid REFERENCES office_zones(id) ON DELETE SET NULL,
      status           text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','revoked','expired')),
      expires_at       timestamptz NOT NULL,
      created_by       uuid REFERENCES team_members(id) ON DELETE SET NULL,
      revoked_by       uuid REFERENCES team_members(id) ON DELETE SET NULL,
      revoked_at       timestamptz,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_guest_badges
      ADD COLUMN IF NOT EXISTS lobby_request_id uuid UNIQUE REFERENCES office_lobby_requests(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS allowed_zone_id uuid REFERENCES office_zones(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES team_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES team_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_guest_badges_office_status
      ON office_guest_badges(office_id, status, expires_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_guest_badges_email
      ON office_guest_badges(lower(guest_email), expires_at DESC)
  `)
}

export async function upsertOfficeGuestBadge(input: {
  officeId: string
  lobbyRequestId: string
  guestName: string
  guestEmail: string
  allowedZoneId: string
  createdBy?: string | null
  expiresAt: string
}) {
  await ensureOfficeGuestBadgesTable()

  return await queryOne<OfficeGuestBadgeRow>(
    `INSERT INTO office_guest_badges (
       office_id, lobby_request_id, guest_name, guest_email, allowed_zone_id,
       status, expires_at, created_by, revoked_by, revoked_at
     )
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, NULL, NULL)
     ON CONFLICT (lobby_request_id) DO UPDATE
       SET guest_name = EXCLUDED.guest_name,
           guest_email = EXCLUDED.guest_email,
           allowed_zone_id = EXCLUDED.allowed_zone_id,
           status = 'active',
           expires_at = EXCLUDED.expires_at,
           revoked_by = NULL,
           revoked_at = NULL,
           updated_at = now()
     RETURNING *`,
    [
      input.officeId,
      input.lobbyRequestId,
      input.guestName,
      input.guestEmail.trim().toLowerCase(),
      input.allowedZoneId,
      input.expiresAt,
      input.createdBy ?? null
    ]
  )
}

export async function revokeOfficeGuestBadgeForRequest(input: {
  officeId: string
  lobbyRequestId: string
  revokedBy?: string | null
  status: 'revoked' | 'expired'
}) {
  await ensureOfficeGuestBadgesTable()
  await execute(
    `UPDATE office_guest_badges
     SET status = $1,
         revoked_by = $2,
         revoked_at = now(),
         updated_at = now()
     WHERE office_id = $3
       AND lobby_request_id = $4
       AND status = 'active'`,
    [input.status, input.revokedBy ?? null, input.officeId, input.lobbyRequestId]
  )
}

export async function updateOfficeGuestBadgeStatus(input: {
  officeId: string
  badgeId: string
  status: 'active' | 'revoked' | 'expired'
  actorId?: string | null
  expiresAt?: string
}) {
  await ensureOfficeGuestBadgesTable()

  if (input.status === 'active') {
    return await queryOne<OfficeGuestBadgeRow>(
      `UPDATE office_guest_badges
       SET status = 'active',
           expires_at = COALESCE($1, expires_at),
           revoked_by = NULL,
           revoked_at = NULL,
           updated_at = now()
       WHERE office_id = $2
         AND id = $3
         AND allowed_zone_id IS NOT NULL
       RETURNING *`,
      [input.expiresAt ?? null, input.officeId, input.badgeId]
    )
  }

  return await queryOne<OfficeGuestBadgeRow>(
    `UPDATE office_guest_badges
     SET status = $1,
         revoked_by = $2,
         revoked_at = now(),
         updated_at = now()
     WHERE office_id = $3
       AND id = $4
     RETURNING *`,
    [input.status, input.actorId ?? null, input.officeId, input.badgeId]
  )
}
