/**
 * POST /api/public/office-lobby/:officeId/request/:requestId/cancel
 * Lets the submitting guest browser remove a still-pending lobby request.
 */

import { queryOne } from '~~/server/utils/db'
import {
  ensureOfficeLobbyRequestsTable,
  expireStaleOfficeLobbyRequests,
  markOfficeLobbyNotificationsRead
} from '~~/server/utils/officeLobbyRequests'
import { revokeOfficeGuestBadgeForRequest } from '~~/server/utils/officeGuestBadges'
import type { OfficeLobbyRequestRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  const requestId = getRouterParam(event, 'requestId')
  if (!officeId || !requestId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and requestId required' })
  }

  await ensureOfficeLobbyRequestsTable()
  await expireStaleOfficeLobbyRequests(officeId, requestId)

  const request = await queryOne<OfficeLobbyRequestRow>(
    `UPDATE office_lobby_requests
     SET status = 'expired',
         handled_at = now(),
         updated_at = now()
     WHERE office_id = $1
       AND id = $2
       AND status IN ('pending', 'accepted')
     RETURNING *`,
    [officeId, requestId]
  )

  if (!request) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Lobby request can no longer be cancelled'
    })
  }

  await markOfficeLobbyNotificationsRead(request.notification_ids)
  if (request.status === 'expired') {
    await revokeOfficeGuestBadgeForRequest({
      officeId,
      lobbyRequestId: request.id,
      status: 'expired'
    })
  }

  return { request }
})
