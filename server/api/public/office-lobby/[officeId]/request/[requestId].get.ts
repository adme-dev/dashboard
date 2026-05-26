/**
 * GET /api/public/office-lobby/:officeId/request/:requestId
 * Public status check for a guest lobby request. The request id is returned
 * only to the submitting browser, so this exposes minimal status data.
 */

import { queryOne } from '~~/server/utils/db'
import {
  expireStaleOfficeLobbyRequests,
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS,
  OFFICE_LOBBY_PENDING_EXPIRES_SQL
} from '~~/server/utils/officeLobbyRequests'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { parseOfficeLobbyMessage } from '~~/app/utils/officePrejoin'
import type { OfficeLobbyRequestRow } from '~~/app/types/office'

type LobbyRequestStatus = Pick<
  OfficeLobbyRequestRow,
  'id' | 'status' | 'created_at' | 'handled_at' | 'scheduled_start_at' | 'message'
> & {
  zone_id: string | null
  zone_name: string | null
  zone_slug: string | null
  pending_expires_at: string
  accepted_expires_at: string | null
}

type StatusMeeting = {
  id: string
  title: string
  zone_id: string | null
  zone_name: string | null
  zone_slug: string | null
  scheduled_start_at: string | null
  duration_minutes: number | null
}

const OFFICE_LOBBY_PENDING_EXPIRES_FOR_REQUEST_SQL = OFFICE_LOBBY_PENDING_EXPIRES_SQL
  .replaceAll('scheduled_start_at', 'olr.scheduled_start_at')
  .replaceAll('created_at', 'olr.created_at')

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  const requestId = getRouterParam(event, 'requestId')
  if (!officeId || !requestId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and requestId required' })
  }

  await expireStaleOfficeLobbyRequests(officeId, requestId)

  const request = await queryOne<LobbyRequestStatus>(
    `SELECT olr.id,
            olr.status,
            olr.created_at,
            olr.handled_at,
            olr.scheduled_start_at,
            olr.message,
            olr.zone_id,
            ${OFFICE_LOBBY_PENDING_EXPIRES_FOR_REQUEST_SQL} AS pending_expires_at,
            CASE
              WHEN olr.handled_at IS NOT NULL
              THEN olr.handled_at + interval '${OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS} hours'
              ELSE NULL
            END AS accepted_expires_at,
            z.name AS zone_name,
            z.slug AS zone_slug
     FROM office_lobby_requests olr
     LEFT JOIN office_zones z ON z.id = olr.zone_id
     WHERE olr.office_id = $1
       AND olr.id = $2`,
    [officeId, requestId]
  )

  if (!request) {
    throw createError({ statusCode: 404, statusMessage: 'Lobby request not found' })
  }

  const parsedMessage = parseOfficeLobbyMessage(request.message ?? '')
  const meetingId = parsedMessage.meetingId
  if (meetingId) await ensureOfficeMeetingArtifactsTables()
  const meeting = meetingId
    ? await queryOne<StatusMeeting>(
        `SELECT id,
                title,
                zone_id,
                (SELECT name FROM office_zones WHERE id = office_meeting_sessions.zone_id) AS zone_name,
                (SELECT slug FROM office_zones WHERE id = office_meeting_sessions.zone_id) AS zone_slug,
                consent #>> '{setup,scheduled_start_at}' AS scheduled_start_at,
                NULLIF(consent #>> '{setup,duration_minutes}', '')::int AS duration_minutes
         FROM office_meeting_sessions
         WHERE id = $1
           AND office_id = $2
         LIMIT 1`,
        [meetingId, officeId]
      )
    : null
  const meetingTitle = meeting?.title ?? parsedMessage.meetingTitle
  const handoffZoneId = request.zone_id ?? meeting?.zone_id ?? null
  const handoffZoneName = request.zone_name ?? meeting?.zone_name ?? null
  const { message: _message, ...publicRequest } = request

  return {
    request: publicRequest,
    meeting: meetingId
      ? {
          id: meetingId,
          title: meetingTitle,
          scheduledStartAt: meeting?.scheduled_start_at ?? request.scheduled_start_at,
          durationMinutes: meeting?.duration_minutes ?? null
        }
      : null,
    guestContext: {
      note: parsedMessage.note,
      intakeAnswers: parsedMessage.intakeAnswers
    },
    handoff: request.status === 'accepted' && handoffZoneId
      ? {
          type: 'room',
          label: handoffZoneName || 'Office lobby',
          path: `/lobby-room/${officeId}/${requestId}`
        }
      : null
  }
})
