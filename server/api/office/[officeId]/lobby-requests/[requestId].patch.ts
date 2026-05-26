/**
 * PATCH /api/office/:officeId/lobby-requests/:requestId
 * Accepts, declines, or expires a guest lobby request.
 */

import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { createMeetingGuestIntakeArtifact, createMeetingPlaceholderArtifacts, ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import {
  ensureOfficeLobbyRequestsTable,
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS,
  expireStaleOfficeLobbyRequests,
  markOfficeLobbyNotificationsRead
} from '~~/server/utils/officeLobbyRequests'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import {
  revokeOfficeGuestBadgeForRequest,
  upsertOfficeGuestBadge
} from '~~/server/utils/officeGuestBadges'
import { ensureOfficeMeetingThreadChannel } from '~~/server/utils/officeThreads'
import { parseOfficeLobbyMessage } from '~~/app/utils/officePrejoin'
import type { OfficeLobbyRequestRow } from '~~/app/types/office'

const Body = z.object({
  status: z.enum(['accepted', 'declined', 'expired'])
})

type LobbyRequestWithZone = OfficeLobbyRequestRow & {
  zone_name: string | null
  zone_slug: string | null
}
type AttachedMeeting = {
  id: string
  zone_id: string | null
}
type LobbyAcceptPreflight = {
  zone_id: string | null
  message: string | null
}
type ResolvedLobbyRoom = {
  id: string
  zone_name: string | null
  zone_slug: string | null
}

function inviteMeetingIdFromMessage(message?: string | null) {
  const match = message?.match(/^meeting id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/im)
  return match?.[1] ?? null
}

function acceptedGuestThreadContent(request: LobbyRequestWithZone) {
  return [
    `Guest admitted: ${request.guest_name}`,
    request.guest_email,
    request.zone_name ? `Room: ${request.zone_name}` : null
  ].filter(Boolean).join('\n')
}

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  const requestId = getRouterParam(event, 'requestId')
  if (!officeId || !requestId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and requestId required' })
  }

  const { user } = await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))
  let meetingTablesEnsured = false
  async function ensureMeetingTables() {
    if (meetingTablesEnsured) return
    await ensureOfficeMeetingArtifactsTables()
    meetingTablesEnsured = true
  }

  await ensureOfficeLobbyRequestsTable()
  await expireStaleOfficeLobbyRequests(officeId, requestId)

  if (body.status === 'accepted') {
    const preflight = await queryOne<LobbyAcceptPreflight>(
      `SELECT zone_id, message
       FROM office_lobby_requests
       WHERE id = $1
         AND office_id = $2
         AND status = 'pending'`,
      [requestId, officeId]
    )
    if (!preflight) {
      throw createError({ statusCode: 404, statusMessage: 'Pending lobby request not found' })
    }
    const inviteMeetingId = inviteMeetingIdFromMessage(preflight.message)
    if (inviteMeetingId) await ensureMeetingTables()
    const invitedMeeting = !preflight.zone_id && inviteMeetingId
      ? await queryOne<Pick<AttachedMeeting, 'zone_id'>>(
          `SELECT zone_id
           FROM office_meeting_sessions
           WHERE id = $1
             AND office_id = $2`,
          [inviteMeetingId, officeId]
        )
      : null
    if (!preflight.zone_id && !invitedMeeting?.zone_id) {
      throw createError({ statusCode: 400, statusMessage: 'Accepted guest requests require an approved room' })
    }
  }

  const request = await queryOne<LobbyRequestWithZone>(
    `UPDATE office_lobby_requests olr
     SET status = $1,
         handled_by = $2,
         handled_at = now()
     WHERE olr.id = $3
       AND olr.office_id = $4
       AND (
         olr.status = 'pending'
         OR ($1 = 'expired' AND olr.status = 'accepted')
       )
     RETURNING olr.*,
       (SELECT name FROM office_zones WHERE id = olr.zone_id) AS zone_name,
       (SELECT slug FROM office_zones WHERE id = olr.zone_id) AS zone_slug`,
    [body.status, user.id, requestId, officeId]
  )

  if (!request) {
    throw createError({ statusCode: 404, statusMessage: 'Pending lobby request not found' })
  }

  await markOfficeLobbyNotificationsRead(request.notification_ids)
  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: `lobby_request.${body.status}`,
    targetType: 'office_lobby_request',
    targetId: request.id,
    metadata: {
      guestEmail: request.guest_email,
      zoneId: request.zone_id,
      scheduledStartAt: request.scheduled_start_at
    }
  })

  if (body.status === 'accepted') {
    const isScheduled = Boolean(request.scheduled_start_at)
    const inviteMeetingId = inviteMeetingIdFromMessage(request.message)
    const parsedLobbyMessage = parseOfficeLobbyMessage(request.message ?? '')
    const participantHandles = [`user:${user.id}`, `client:${request.id}`]
    let meetingSessionId: string | null = null
    let guestBadgeZoneId: string | null = null
    let meetingArtifactTitle = `${request.guest_name} in ${request.zone_name || 'Office Lobby'}`

    await ensureMeetingTables()
    const attachedMeeting = inviteMeetingId
      ? await queryOne<AttachedMeeting>(
          `UPDATE office_meeting_sessions
           SET guest_emails = (
                 SELECT ARRAY(
                   SELECT DISTINCT email
                   FROM unnest(COALESCE(guest_emails, '{}'::text[]) || $1::text[]) AS email
                   WHERE email <> ''
                 )
               ),
               participant_handles = (
                 SELECT ARRAY(
                   SELECT DISTINCT handle
                   FROM unnest(COALESCE(participant_handles, '{}'::text[]) || $2::text[]) AS handle
                   WHERE handle <> ''
                 )
               ),
               zone_id = COALESCE(zone_id, $3),
               updated_at = now()
           WHERE id = $4
             AND office_id = $5
           RETURNING id, zone_id`,
          [[request.guest_email], participantHandles, request.zone_id, inviteMeetingId, officeId]
        )
      : null

    if (!attachedMeeting) {
      const createdMeeting = await queryOne<AttachedMeeting>(
        `INSERT INTO office_meeting_sessions (
         office_id, zone_id, lobby_request_id, lobby_id, source, status, title,
         participant_handles, guest_emails, consent, retention_days, started_at, created_by
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[], $10, 90, $11, $12
       WHERE NOT EXISTS (
         SELECT 1 FROM office_meeting_sessions WHERE lobby_request_id = $3
       )
       RETURNING id, zone_id`,
        [
          officeId,
          request.zone_id,
          request.id,
          request.lobby_id,
          isScheduled ? 'scheduled' : 'lobby',
          isScheduled ? 'planned' : 'live',
          `${request.guest_name} in ${request.zone_name || 'Office Lobby'}`,
          participantHandles,
          [request.guest_email],
          JSON.stringify({ ai_notes: false, recording: false, transcript: false }),
          request.scheduled_start_at ?? new Date().toISOString(),
          user.id
        ]
      )
      meetingSessionId = createdMeeting?.id ?? null
      guestBadgeZoneId = createdMeeting?.zone_id ?? request.zone_id ?? null
      meetingArtifactTitle = `${request.guest_name} in ${request.zone_name || 'Office Lobby'}`
      if (meetingSessionId) {
        await createMeetingPlaceholderArtifacts({
          meetingSessionId,
          title: `${request.guest_name} in ${request.zone_name || 'Office Lobby'}`,
          notesContent: `Guest: ${request.guest_email}`,
          summaryContent: `Waiting for ${request.guest_name}'s guest session to produce a meeting summary.`,
          actionItemsContent: `Action items for ${request.guest_name}'s guest session will appear after notes are captured.`,
          metadata: {
            status: 'placeholder',
            source: 'lobby_request',
            guest_emails: [request.guest_email],
            participant_handles: participantHandles
          },
          createdBy: user.id
        })
        await logOfficeAuditEvent({
          officeId,
          actorId: user.id,
          action: 'meeting.created',
          targetType: 'office_meeting_session',
          targetId: meetingSessionId,
          metadata: {
            source: isScheduled ? 'scheduled_lobby_request' : 'lobby_request',
            lobby_request_id: request.id,
            guest_email: request.guest_email,
            guest_count: 1,
            zone_id: guestBadgeZoneId
          }
        })
      }
    } else {
      meetingSessionId = attachedMeeting.id
      guestBadgeZoneId = attachedMeeting.zone_id
      meetingArtifactTitle = parsedLobbyMessage.meetingTitle || request.zone_name || 'Meeting'
      if (guestBadgeZoneId && request.zone_id !== guestBadgeZoneId) {
        const resolvedRoom = await queryOne<ResolvedLobbyRoom>(
          `UPDATE office_lobby_requests
           SET zone_id = $1,
               updated_at = now()
           WHERE id = $2
             AND office_id = $3
           RETURNING id,
             (SELECT name FROM office_zones WHERE id = office_lobby_requests.zone_id) AS zone_name,
             (SELECT slug FROM office_zones WHERE id = office_lobby_requests.zone_id) AS zone_slug`,
          [guestBadgeZoneId, request.id, officeId]
        )
        request.zone_id = guestBadgeZoneId
        request.zone_name = resolvedRoom?.zone_name ?? request.zone_name
        request.zone_slug = resolvedRoom?.zone_slug ?? request.zone_slug
      }
      await logOfficeAuditEvent({
        officeId,
        actorId: user.id,
        action: 'meeting.updated',
        targetType: 'office_meeting_session',
        targetId: attachedMeeting.id,
        metadata: {
          source: 'lobby_request_accepted',
          lobby_request_id: request.id,
          guest_email: request.guest_email,
          guest_count: 1,
          zone_id: guestBadgeZoneId
        }
      })
    }

    if (meetingSessionId && (parsedLobbyMessage.note || parsedLobbyMessage.intakeAnswers.length)) {
      await createMeetingGuestIntakeArtifact({
        meetingSessionId,
        title: meetingArtifactTitle,
        lobbyRequestId: request.id,
        guestName: request.guest_name,
        guestEmail: request.guest_email,
        note: parsedLobbyMessage.note,
        intakeAnswers: parsedLobbyMessage.intakeAnswers,
        createdBy: user.id
      })
      await logOfficeAuditEvent({
        officeId,
        actorId: user.id,
        action: 'meeting.guest_intake_captured',
        targetType: 'office_meeting_session',
        targetId: meetingSessionId,
        metadata: {
          source: 'lobby_request_accepted',
          lobby_request_id: request.id,
          guest_email: request.guest_email,
          guest_name: request.guest_name,
          intake_count: parsedLobbyMessage.intakeAnswers.length,
          has_guest_note: Boolean(parsedLobbyMessage.note)
        }
      })
    }

    if (guestBadgeZoneId) {
      await upsertOfficeGuestBadge({
        officeId,
        lobbyRequestId: request.id,
        guestName: request.guest_name,
        guestEmail: request.guest_email,
        allowedZoneId: guestBadgeZoneId,
        createdBy: user.id,
        expiresAt: new Date(Date.now() + OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
      })
    }

    if (meetingSessionId) {
      try {
        const channel = await ensureOfficeMeetingThreadChannel({
          officeId,
          meetingId: meetingSessionId,
          actorId: user.id
        })
        if (channel) {
          await queryOne(
            `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [
              channel.id,
              user.id,
              acceptedGuestThreadContent(request),
              JSON.stringify({
                source: 'office_lobby_request',
                event: 'guest_accepted',
                meeting_id: meetingSessionId,
                lobby_request_id: request.id,
                guest_email: request.guest_email,
                guest_name: request.guest_name,
                zone_id: guestBadgeZoneId,
                accepted_at: request.handled_at ?? new Date().toISOString()
              })
            ]
          )
        }
      } catch (error) {
        console.warn('[office-lobby-request] could not write meeting thread event:', error)
      }
    }

    return { request, meetingSessionId }
  } else {
    await revokeOfficeGuestBadgeForRequest({
      officeId,
      lobbyRequestId: request.id,
      revokedBy: user.id,
      status: body.status === 'expired' ? 'expired' : 'revoked'
    })
    if (body.status === 'expired') {
      const endedMeeting = await queryOne<{ id: string }>(
        `UPDATE office_meeting_sessions
         SET status = 'ended',
             ended_at = COALESCE(ended_at, now()),
             updated_at = now()
         WHERE office_id = $1
           AND lobby_request_id = $2
           AND status IN ('planned', 'live')
         RETURNING id`,
        [officeId, request.id]
      )
      if (endedMeeting) {
        await logOfficeAuditEvent({
          officeId,
          actorId: user.id,
          action: 'meeting.ended',
          targetType: 'office_meeting_session',
          targetId: endedMeeting.id,
          metadata: {
            source: 'lobby_request_expired',
            lobby_request_id: request.id,
            guest_email: request.guest_email
          }
        })
      }
    }
  }

  return { request }
})
