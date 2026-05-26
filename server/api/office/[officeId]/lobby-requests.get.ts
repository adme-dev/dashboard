/**
 * GET /api/office/:officeId/lobby-requests
 * Lists recent external guest lobby requests for office members.
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import {
  ensureOfficeLobbyRequestsTable,
  expireStaleOfficeLobbyRequests,
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS,
  OFFICE_LOBBY_PENDING_EXPIRES_SQL
} from '~~/server/utils/officeLobbyRequests'
import type { OfficeLobbyRequestRow, OfficeLobbyRequestStatus, OfficeMemberRow } from '~~/app/types/office'

type LobbyRequestWithZone = OfficeLobbyRequestRow & {
  zone_name: string | null
  zone_slug: string | null
  handled_by_name: string | null
  pending_expires_at: string
  accepted_expires_at: string | null
}

const OFFICE_LOBBY_PENDING_EXPIRES_FOR_REQUEST_SQL = OFFICE_LOBBY_PENDING_EXPIRES_SQL
  .replaceAll('scheduled_start_at', 'olr.scheduled_start_at')
  .replaceAll('created_at', 'olr.created_at')

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

  await ensureOfficeLobbyRequestsTable()
  await expireStaleOfficeLobbyRequests(officeId)

  const query = getQuery(event)
  const status = typeof query.status === 'string'
    ? query.status
    : 'pending'
  const allowedStatuses: OfficeLobbyRequestStatus[] = ['pending', 'accepted', 'declined', 'expired']
  const statusFilter = allowedStatuses.includes(status as OfficeLobbyRequestStatus)
    ? status
    : 'pending'

  const requests = await queryRows<LobbyRequestWithZone>(
    `SELECT olr.*,
            ${OFFICE_LOBBY_PENDING_EXPIRES_FOR_REQUEST_SQL} AS pending_expires_at,
            CASE
              WHEN olr.handled_at IS NOT NULL
              THEN olr.handled_at + interval '${OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS} hours'
              ELSE NULL
            END AS accepted_expires_at,
            z.name AS zone_name,
            z.slug AS zone_slug,
            handler.name AS handled_by_name
     FROM office_lobby_requests olr
     LEFT JOIN office_zones z ON z.id = olr.zone_id
     LEFT JOIN team_members handler ON handler.id = olr.handled_by
     WHERE olr.office_id = $1
       AND olr.status = $2
     ORDER BY
       CASE
         WHEN $2 = 'pending' AND olr.scheduled_start_at IS NOT NULL THEN 0
         ELSE 1
       END ASC,
       CASE
         WHEN $2 = 'pending' THEN olr.scheduled_start_at
         ELSE NULL
       END ASC NULLS LAST,
       olr.created_at DESC
     LIMIT 25`,
    [officeId, statusFilter]
  )

  return { requests }
})
