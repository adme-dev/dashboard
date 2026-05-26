import { execute, queryRows } from '~~/server/utils/db'

export const OFFICE_LOBBY_PENDING_WINDOW_MINUTES = 30
export const OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS = 2
export const OFFICE_LOBBY_PENDING_EXPIRES_SQL = `COALESCE(scheduled_start_at, created_at) + interval '${OFFICE_LOBBY_PENDING_WINDOW_MINUTES} minutes'`

let ensurePromise: Promise<void> | null = null

export function ensureOfficeLobbyRequestsTable() {
  ensurePromise ??= ensureOfficeLobbyRequestsTableOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeLobbyRequestsTableOnce() {
  await execute(`
    CREATE TABLE IF NOT EXISTS office_lobby_requests (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      office_id       uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      lobby_id        uuid,
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
    )
  `)
  await execute(`
    ALTER TABLE office_lobby_requests
      ADD COLUMN IF NOT EXISTS lobby_id uuid
  `)
  await execute(`
    ALTER TABLE office_lobby_requests
      ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_lobby_requests_office_status
      ON office_lobby_requests(office_id, status, created_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_lobby_requests_zone
      ON office_lobby_requests(zone_id, created_at DESC)
      WHERE zone_id IS NOT NULL
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_lobby_requests_lobby
      ON office_lobby_requests(lobby_id, status, created_at DESC)
      WHERE lobby_id IS NOT NULL
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_lobby_requests_scheduled_start
      ON office_lobby_requests(office_id, scheduled_start_at)
      WHERE scheduled_start_at IS NOT NULL
  `)
}

export async function expireStaleOfficeLobbyRequests(officeId: string, requestId?: string) {
  await ensureOfficeLobbyRequestsTable()

  const requestFilter = requestId ? 'AND id = $2' : ''
  const params = requestId ? [officeId, requestId] : [officeId]

  const expiredPending = await queryRows<{ notification_ids: string[] }>(
    `UPDATE office_lobby_requests
     SET status = 'expired',
         handled_at = COALESCE(handled_at, now()),
         updated_at = now()
     WHERE office_id = $1
       ${requestFilter}
       AND status = 'pending'
       AND COALESCE(scheduled_start_at, created_at) < now() - interval '${OFFICE_LOBBY_PENDING_WINDOW_MINUTES} minutes'
     RETURNING notification_ids`,
    params
  )
  await markOfficeLobbyNotificationsRead(expiredPending.flatMap(request => request.notification_ids))

  const expiredAccepted = await queryRows<{ notification_ids: string[] }>(
    `UPDATE office_lobby_requests
     SET status = 'expired',
         updated_at = now()
     WHERE office_id = $1
       ${requestFilter}
       AND status = 'accepted'
       AND handled_at IS NOT NULL
       AND handled_at < now() - interval '${OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS} hours'
     RETURNING notification_ids`,
    params
  )
  await markOfficeLobbyNotificationsRead(expiredAccepted.flatMap(request => request.notification_ids))
}

export async function markOfficeLobbyNotificationsRead(notificationIds: string[]) {
  if (notificationIds.length === 0) return

  await execute(
    `UPDATE notifications
     SET is_read = true,
         read_at = COALESCE(read_at, now())
     WHERE id = ANY($1::uuid[])
       AND is_read = false`,
    [notificationIds]
  )
}
