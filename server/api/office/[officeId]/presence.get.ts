/**
 * GET /api/office/:officeId/presence
 * Server-side live presence summary backed by OfficeRoom location sync.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficePresenceLocationsTable } from '~~/server/utils/officePresenceLocations'
import type {
  ActorHandle,
  OfficeMemberRow,
  OfficePresenceSummary,
  OfficePresenceSummaryLocation
} from '~~/app/types/office'

type PresenceLocationRow = Omit<OfficePresenceSummaryLocation, 'is_online'> & {
  is_online: boolean | string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficePresenceLocationsTable()

  const rows = await queryRows<PresenceLocationRow>(
    `SELECT opl.office_id::text,
            opl.actor_type,
            opl.actor_id::text,
            opl.handle,
            opl.zone_id::text,
            opl.presence,
            opl.last_seen_at,
            opl.updated_at,
            (opl.presence = 'online' AND opl.last_seen_at >= now() - interval '2 minutes') AS is_online,
            CASE
              WHEN opl.actor_type = 'user' THEN tm.name
              ELSE cu.name
            END AS display_name,
            CASE
              WHEN opl.actor_type = 'user' THEN tm.avatar_url
              ELSE NULL
            END AS avatar_url,
            z.name AS zone_name,
            z.slug AS zone_slug,
            z.zone_type
     FROM office_presence_locations opl
     LEFT JOIN team_members tm
       ON opl.actor_type = 'user'
      AND tm.id = opl.actor_id
     LEFT JOIN client_users cu
       ON opl.actor_type = 'client'
      AND cu.id = opl.actor_id
     LEFT JOIN office_zones z ON z.id = opl.zone_id
     WHERE opl.office_id = $1
     ORDER BY is_online DESC, opl.last_seen_at DESC
     LIMIT 200`,
    [officeId]
  )

  const locations = rows.map(row => ({
    ...row,
    is_online: row.is_online === true || row.is_online === 'true'
  }))
  const zoneOccupancy: Record<string, ActorHandle[]> = {}
  for (const location of locations) {
    if (!location.is_online || !location.zone_id) continue
    ;(zoneOccupancy[location.zone_id] ||= []).push(location.handle)
  }

  return {
    locations,
    onlineCount: locations.filter(location => location.is_online).length,
    zoneOccupancy
  } satisfies OfficePresenceSummary
})
