/**
 * POST /api/public/office-lobby/:officeId/request/:requestId/token
 * Mints a short-lived office WS token for an approved external lobby guest.
 */

import type { H3Event } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { signOfficeJwt, type OfficeJwtClaims } from '~~/server/utils/officeJwt'
import {
  expireStaleOfficeLobbyRequests,
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS
} from '~~/server/utils/officeLobbyRequests'
import {
  ensureOfficeGuestBadgesTable,
  upsertOfficeGuestBadge
} from '~~/server/utils/officeGuestBadges'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeGuestBadgeRow, OfficeLobbyGuestRoomHandshake, OfficeLobbyRequestRow } from '~~/app/types/office'
import { DEFAULT_OFFICE_PREJOIN, parseOfficeLobbyMessage } from '~~/app/utils/officePrejoin'

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

type ApprovedLobbyRequest = Pick<
  OfficeLobbyRequestRow,
  'id' | 'office_id' | 'zone_id' | 'guest_name' | 'guest_email' | 'message' | 'status' | 'handled_at' | 'scheduled_start_at'
> & {
  zone_slug: string | null
  zone_name: string | null
  zone_capacity: number | null
}

type GuestMeeting = {
  id: string
  title: string
  zone_id: string | null
  zone_slug: string | null
  zone_name: string | null
  zone_capacity: number | null
  scheduled_start_at: string | null
  duration_minutes: number | null
}

const DEFAULT_WORKER_URL = 'wss://office-room-worker.adme-dev.workers.dev'

function getCfOrProcessEnv(event: H3Event, key: string): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.[key] as string | undefined) ?? process.env[key]
}

async function getGuestMeeting(meetingId: string, officeId: string) {
  return await queryOne<GuestMeeting>(
    `SELECT oms.id,
            oms.title,
            oms.zone_id,
            oz.slug AS zone_slug,
            oz.name AS zone_name,
            oz.capacity AS zone_capacity,
            oms.consent #>> '{setup,scheduled_start_at}' AS scheduled_start_at,
            NULLIF(oms.consent #>> '{setup,duration_minutes}', '')::int AS duration_minutes
     FROM office_meeting_sessions oms
     LEFT JOIN office_zones oz ON oz.id = oms.zone_id
     WHERE oms.id = $1
       AND oms.office_id = $2
     LIMIT 1`,
    [meetingId, officeId]
  )
}

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  const requestId = getRouterParam(event, 'requestId')
  if (!officeId || !requestId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and requestId required' })
  }

  await expireStaleOfficeLobbyRequests(officeId, requestId)

  const request = await queryOne<ApprovedLobbyRequest>(
    `SELECT olr.id,
            olr.office_id,
            olr.zone_id,
            olr.guest_name,
            olr.guest_email,
            olr.message,
            olr.status,
            olr.handled_at,
            olr.scheduled_start_at,
            z.slug AS zone_slug,
            z.name AS zone_name,
            z.capacity AS zone_capacity
     FROM office_lobby_requests olr
     LEFT JOIN office_zones z ON z.id = olr.zone_id
     WHERE olr.office_id = $1
       AND olr.id = $2`,
    [officeId, requestId]
  )
  if (!request) {
    throw createError({ statusCode: 404, statusMessage: 'Lobby request not found' })
  }
  if (request.status !== 'accepted') {
    throw createError({ statusCode: 403, statusMessage: 'Lobby request has not been accepted' })
  }
  const acceptedAt = request.handled_at ? new Date(request.handled_at).getTime() : null
  if (!acceptedAt || Date.now() - acceptedAt > OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS * 60 * 60 * 1000) {
    throw createError({ statusCode: 403, statusMessage: 'Guest room link has expired' })
  }
  const parsedMessage = parseOfficeLobbyMessage(request.message)
  if (parsedMessage.meetingId) await ensureOfficeMeetingArtifactsTables()
  let meeting = !request.zone_id && parsedMessage.meetingId
    ? await getGuestMeeting(parsedMessage.meetingId, officeId)
    : null
  const approvedZoneId = request.zone_id ?? meeting?.zone_id ?? null
  const approvedZoneSlug = request.zone_slug ?? meeting?.zone_slug ?? null
  const approvedZoneName = request.zone_name ?? meeting?.zone_name ?? null
  const approvedZoneCapacity = request.zone_capacity ?? meeting?.zone_capacity ?? null
  if (!approvedZoneId) {
    throw createError({ statusCode: 403, statusMessage: 'Guest room link is missing an approved room' })
  }
  if (!request.zone_id && approvedZoneId) {
    await queryOne(
      `UPDATE office_lobby_requests
       SET zone_id = $1,
           updated_at = now()
       WHERE office_id = $2
         AND id = $3
       RETURNING id`,
      [approvedZoneId, officeId, requestId]
    )
  }

  await ensureOfficeGuestBadgesTable()
  const expiresAt = new Date(acceptedAt + OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const existingBadge = await queryOne<OfficeGuestBadgeRow>(
    `SELECT *
     FROM office_guest_badges
     WHERE office_id = $1
       AND lobby_request_id = $2`,
    [officeId, requestId]
  )
  if (existingBadge && (existingBadge.status !== 'active' || new Date(existingBadge.expires_at).getTime() <= Date.now())) {
    throw createError({ statusCode: 403, statusMessage: 'Guest badge is not active' })
  }
  if (existingBadge && existingBadge.allowed_zone_id !== approvedZoneId) {
    throw createError({ statusCode: 403, statusMessage: 'Guest badge room does not match approved room' })
  }
  const badge = existingBadge ?? await upsertOfficeGuestBadge({
    officeId,
    lobbyRequestId: request.id,
    guestName: request.guest_name,
    guestEmail: request.guest_email,
    allowedZoneId: approvedZoneId,
    createdBy: null,
    expiresAt
  })

  const secret = getCfOrProcessEnv(event, 'OFFICE_SYNC_SECRET')
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: 'OFFICE_SYNC_SECRET not configured' })
  }

  const claims: OfficeJwtClaims = {
    handle: `client:${request.id}`,
    name: request.guest_name,
    avatarUrl: null,
    role: 'guest',
    isGuest: true,
    officeId,
    allowedZoneId: approvedZoneId,
    guestBadgeId: badge?.id ?? null,
    zoneCapacities: approvedZoneCapacity && approvedZoneCapacity > 0
      ? { [approvedZoneId]: Math.floor(Number(approvedZoneCapacity)) }
      : {},
    exp: Math.floor(Date.now() / 1000) + 10 * 60
  }

  const token = await signOfficeJwt(claims, secret)
  if (!meeting && parsedMessage.meetingId) {
    meeting = await getGuestMeeting(parsedMessage.meetingId, officeId)
  }

  const response: OfficeLobbyGuestRoomHandshake = {
    token,
    workerUrl: getCfOrProcessEnv(event, 'OFFICE_WORKER_URL') ?? DEFAULT_WORKER_URL,
    exp: claims.exp,
    guest: {
      name: request.guest_name,
      email: request.guest_email,
      badgeId: badge?.id ?? null,
      accessExpiresAt: badge?.expires_at ?? expiresAt,
      source: parsedMessage.source,
      prejoin: parsedMessage.prejoin ?? DEFAULT_OFFICE_PREJOIN,
      note: parsedMessage.note,
      intakeAnswers: parsedMessage.intakeAnswers
    },
    meeting: parsedMessage.meetingId
      ? {
          id: parsedMessage.meetingId,
          title: meeting?.title ?? parsedMessage.meetingTitle,
          scheduledStartAt: meeting?.scheduled_start_at ?? request.scheduled_start_at,
          durationMinutes: meeting?.duration_minutes ?? null
        }
      : null,
    zone: approvedZoneId
      ? {
          id: approvedZoneId,
          slug: approvedZoneSlug,
          name: approvedZoneName
        }
      : null
  }

  return response
})
