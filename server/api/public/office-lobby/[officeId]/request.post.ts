/**
 * POST /api/public/office-lobby/:officeId/request
 * Records a guest lobby request by notifying office admins.
 */
import { z } from 'zod'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import {
  ensureOfficeLobbyRequestsTable,
  OFFICE_LOBBY_PENDING_EXPIRES_SQL,
  OFFICE_LOBBY_PENDING_WINDOW_MINUTES
} from '~~/server/utils/officeLobbyRequests'
import { ensureOfficeLobbiesTable } from '~~/server/utils/officeLobbies'
import { isInOfficeLobbyAvailabilityWindow } from '~~/server/utils/officeLobbyAvailability'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { getOfficeSettings } from '~~/server/utils/officeSettings'
import { ensureOfficePresenceLocationsTable } from '~~/server/utils/officePresenceLocations'
import { parseOfficeLobbyMessage } from '~~/app/utils/officePrejoin'
import type {
  OfficeLobbyConfig,
  OfficeLobbyRequestSource,
  OfficeLobbyRequestRow,
  OfficeRow,
  OfficeZoneRow
} from '~~/app/types/office'

type LobbyRequestWithExpiry = OfficeLobbyRequestRow & {
  pending_expires_at: string
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(180),
  lobbyHandle: z.string().trim().min(2).max(80).optional(),
  roomSlug: z.string().trim().min(1).max(120).optional(),
  scheduledStartAt: z.string().datetime().optional(),
  meetingId: z.string().uuid().optional(),
  meetingTitle: z.string().trim().min(1).max(160).optional(),
  meetingDurationMinutes: z.number().int().min(1).max(480).optional(),
  source: z.enum(['embed']).optional(),
  message: z.string().trim().max(2000).optional()
})

type LobbyRequestBody = z.infer<typeof bodySchema> & {
  source?: OfficeLobbyRequestSource
}

type RequestLobby = {
  id: string
  handle: string
  destination_zone_id: string | null
  config: OfficeLobbyConfig
}

type InviteMeeting = {
  id: string
  title: string
  zone_id: string | null
  zone_slug: string | null
  scheduled_start_at: string | null
  duration_minutes: number | null
  intake_prompt: string | null
}

function formatScheduledStart(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  }).format(date)
}

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const body: LobbyRequestBody = bodySchema.parse(await readBody(event))
  const guestEmail = body.email.trim().toLowerCase()
  await ensureOfficeLobbyRequestsTable()
  if (body.lobbyHandle) await ensureOfficeLobbiesTable()
  if (body.meetingId) await ensureOfficeMeetingArtifactsTables()

  const office = await queryOne<Pick<OfficeRow, 'id' | 'name'>>(
    `SELECT id, name FROM offices WHERE id = $1`,
    [officeId]
  )
  if (!office) {
    throw createError({ statusCode: 404, statusMessage: 'Office not found' })
  }

  const settings = await getOfficeSettings(officeId)
  if (!settings?.guest_access_enabled || !settings.public_lobbies_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Guest lobby access is disabled for this office' })
  }

  const lobby = body.lobbyHandle
    ? await queryOne<RequestLobby>(
        `SELECT id, handle, destination_zone_id, config
         FROM office_lobbies
         WHERE office_id = $1
           AND lower(handle) = lower($2)
           AND is_active = true
         LIMIT 1`,
        [officeId, body.lobbyHandle]
      )
    : null

  if (body.lobbyHandle && !lobby) {
    throw createError({ statusCode: 404, statusMessage: 'Lobby link not found' })
  }

  const lobbyConfig = lobby?.config ?? {}
  const availabilityMode = lobbyConfig.availability_mode ?? 'manual'
  if (lobby && availabilityMode === 'office_presence') {
    await ensureOfficePresenceLocationsTable()
    const presence = await queryOne<{ online_staff_count: number }>(
      `SELECT COUNT(*)::int AS online_staff_count
       FROM office_presence_locations opl
       JOIN office_members om
         ON om.office_id = opl.office_id
        AND om.user_id = opl.actor_id
       WHERE opl.office_id = $1
         AND opl.actor_type = 'user'
         AND opl.presence = 'online'
         AND opl.last_seen_at > now() - interval '90 seconds'`,
      [officeId]
    )
    if ((presence?.online_staff_count ?? 0) === 0) {
      throw createError({ statusCode: 409, statusMessage: 'No hosts are currently available for drop-ins' })
    }
  }

  if (lobby && availabilityMode === 'scheduled' && !body.scheduledStartAt) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a meeting time for this scheduled lobby' })
  }

  let scheduledStartAt: string | null = null
  if (body.scheduledStartAt) {
    const scheduledAt = new Date(body.scheduledStartAt).getTime()
    const minimumNoticeMs = lobby ? (lobbyConfig.minimum_notice_minutes ?? 0) * 60 * 1000 : 0
    if (!Number.isFinite(scheduledAt)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid meeting time' })
    }
    if (scheduledAt < Date.now() + minimumNoticeMs) {
      throw createError({ statusCode: 400, statusMessage: 'Meeting time is inside the minimum notice window' })
    }
    scheduledStartAt = new Date(scheduledAt).toISOString()
    if (
      lobby
      && availabilityMode === 'scheduled'
      && !isInOfficeLobbyAvailabilityWindow(scheduledStartAt, lobbyConfig.availability_windows)
    ) {
      throw createError({ statusCode: 400, statusMessage: 'Meeting time is outside this lobby availability window' })
    }
  }

  const dailyCap = Number(lobby?.config?.daily_cap ?? 0)
  if (dailyCap > 0) {
    const usage = await queryOne<{ request_count: number }>(
      `SELECT COUNT(*)::int AS request_count
       FROM office_lobby_requests
       WHERE lobby_id = $1
         AND created_at >= date_trunc('day', now())
         AND created_at < date_trunc('day', now()) + interval '1 day'
         AND status <> 'declined'`,
      [lobby?.id]
    )
    if ((usage?.request_count ?? 0) >= dailyCap) {
      throw createError({ statusCode: 429, statusMessage: 'This lobby has reached its daily request limit' })
    }
  }

  const inviteMeeting = body.meetingId
    ? await queryOne<InviteMeeting>(
        `SELECT oms.id,
                oms.title,
                oms.zone_id,
                oz.slug AS zone_slug,
                oms.consent #>> '{setup,scheduled_start_at}' AS scheduled_start_at,
                NULLIF(oms.consent #>> '{setup,duration_minutes}', '')::int AS duration_minutes,
                NULLIF(oms.consent #>> '{setup,intake_prompt}', '') AS intake_prompt
         FROM office_meeting_sessions oms
         LEFT JOIN office_zones oz ON oz.id = oms.zone_id
         WHERE oms.id = $1
           AND oms.office_id = $2
           AND oms.status IN ('planned', 'live')
         LIMIT 1`,
        [body.meetingId, officeId]
      )
    : null

  if (body.meetingId && !inviteMeeting) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting invite not found' })
  }
  if (body.meetingId && !inviteMeeting?.zone_id) {
    throw createError({ statusCode: 400, statusMessage: 'Meeting invite is missing an approved room' })
  }
  if (inviteMeeting?.intake_prompt) {
    const intakeAnswer = parseOfficeLobbyMessage(body.message ?? '').intakeAnswers.find(answer =>
      answer.label === inviteMeeting.intake_prompt
    )
    if (!intakeAnswer?.value.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Answer the meeting intake question before requesting entry' })
    }
  }

  const zone = await queryOne<Pick<OfficeZoneRow, 'id' | 'slug' | 'name'>>(
    body.roomSlug
      ? `SELECT id, slug, name
         FROM office_zones
         WHERE office_id = $1 AND slug = $2 AND zone_type <> 'desk'`
      : lobby?.destination_zone_id
        ? `SELECT id, slug, name
           FROM office_zones
           WHERE office_id = $1 AND id = $2 AND zone_type <> 'desk'`
        : inviteMeeting?.zone_id
          ? `SELECT id, slug, name
             FROM office_zones
             WHERE office_id = $1 AND id = $2 AND zone_type <> 'desk'`
        : `SELECT id, slug, name
           FROM office_zones
           WHERE office_id = $1 AND zone_type <> 'desk'
           ORDER BY CASE WHEN zone_type = 'lobby' THEN 0 ELSE 1 END, created_at ASC
           LIMIT 1`,
    body.roomSlug
      ? [officeId, body.roomSlug]
      : lobby?.destination_zone_id
        ? [officeId, lobby.destination_zone_id]
        : inviteMeeting?.zone_id
          ? [officeId, inviteMeeting.zone_id]
        : [officeId]
  )

  if (body.roomSlug && !zone) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  }
  if (!zone) {
    throw createError({ statusCode: 404, statusMessage: 'No public office rooms available' })
  }

  if (inviteMeeting?.zone_id && zone.id !== inviteMeeting.zone_id) {
    throw createError({ statusCode: 409, statusMessage: 'Meeting invite room does not match this lobby request' })
  }

  if (inviteMeeting?.scheduled_start_at) {
    const inviteScheduledAt = new Date(inviteMeeting.scheduled_start_at).getTime()
    if (Number.isFinite(inviteScheduledAt)) scheduledStartAt = new Date(inviteScheduledAt).toISOString()
  }

  const recipients = await queryRows<{ user_id: string }>(
    `SELECT user_id
     FROM office_members
     WHERE office_id = $1
       AND user_id IS NOT NULL
       AND role = 'admin'`,
    [officeId]
  )

  const fallbackRecipients = recipients.length > 0
    ? recipients
    : await queryRows<{ user_id: string }>(
        `SELECT user_id
         FROM office_members
         WHERE office_id = $1
           AND user_id IS NOT NULL`,
        [officeId]
      )

  const meetingTitle = inviteMeeting?.title ?? body.meetingTitle
  const meetingDurationMinutes = inviteMeeting?.duration_minutes ?? body.meetingDurationMinutes

  const existingPendingRequest = await queryOne<LobbyRequestWithExpiry>(
    `SELECT *,
            ${OFFICE_LOBBY_PENDING_EXPIRES_SQL} AS pending_expires_at
     FROM office_lobby_requests
     WHERE office_id = $1
       AND COALESCE(zone_id::text, '') = COALESCE($2::uuid::text, '')
       AND COALESCE(lobby_id::text, '') = COALESCE($3::uuid::text, '')
       AND lower(guest_email) = lower($4)
       AND status = 'pending'
       AND (
         (
           $5::text IS NULL
           AND message !~* '(^|\\n)meeting id:\\s*[0-9a-f-]{36}(\\s|\\n|$)'
         )
         OR (
           $5::text IS NOT NULL
           AND message ~* ('(^|\\n)meeting id:\\s*' || $5::text || '(\\s|\\n|$)')
         )
       )
       AND COALESCE(scheduled_start_at, created_at) > now() - interval '${OFFICE_LOBBY_PENDING_WINDOW_MINUTES} minutes'
     ORDER BY created_at DESC
     LIMIT 1`,
    [officeId, zone?.id ?? null, lobby?.id ?? null, guestEmail, body.meetingId ?? null]
  )
  if (existingPendingRequest) {
    return {
      ok: true,
      existing: true,
      requestId: existingPendingRequest.id,
      pendingExpiresAt: existingPendingRequest.pending_expires_at,
      notified: 0,
      room: zone ? { id: zone.id, slug: zone.slug, name: zone.name } : null,
      meeting: inviteMeeting
        ? {
            id: inviteMeeting.id,
            title: inviteMeeting.title,
            scheduledStartAt,
            durationMinutes: meetingDurationMinutes
          }
        : null
    }
  }

  const link = zone ? `/office?room=${zone.slug}` : '/office'
  const title = `${body.name} is waiting in the lobby`
  const scheduleText = formatScheduledStart(scheduledStartAt)
  const requestContext = [
    meetingTitle ? `Meeting: ${meetingTitle}.` : '',
    scheduleText ? `Scheduled ${scheduleText} UTC.` : '',
    meetingDurationMinutes ? `${meetingDurationMinutes} min.` : '',
    body.message ?? ''
  ].filter(Boolean).join(' ')
  const storedMessage = [
    body.message ?? '',
    body.source === 'embed' ? 'Source: embed' : '',
    body.meetingId ? `Meeting ID: ${body.meetingId}` : '',
    meetingTitle ? `Meeting: ${meetingTitle}` : ''
  ].filter(Boolean).join('\n')
  const message = zone
    ? `${body.name} (${guestEmail}) requested entry to ${zone.name}.${requestContext ? ` ${requestContext}` : ''}`
    : `${body.name} (${guestEmail}) requested entry to ${office.name}.${requestContext ? ` ${requestContext}` : ''}`

  const request = await queryOne<LobbyRequestWithExpiry>(
    `INSERT INTO office_lobby_requests (
       office_id, lobby_id, zone_id, guest_name, guest_email, message, scheduled_start_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *,
       ${OFFICE_LOBBY_PENDING_EXPIRES_SQL} AS pending_expires_at`,
    [officeId, lobby?.id ?? null, zone?.id ?? null, body.name, guestEmail, storedMessage, scheduledStartAt]
  )
  if (!request) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create lobby request' })
  }

  const notifications = await Promise.all(fallbackRecipients.map(recipient =>
    createNotification({
      userId: recipient.user_id,
      type: 'system',
      title,
      message,
      link,
      metadata: {
        officeId,
        zoneId: zone?.id ?? null,
        zoneSlug: zone?.slug ?? null,
        guestName: body.name,
        guestEmail,
        lobbyRequestId: request.id,
        meetingId: body.meetingId,
        meetingTitle,
        meetingDurationMinutes,
        scheduledStartAt,
        source: 'office_lobby',
        requestSource: body.source ?? 'direct'
      },
      reason: 'direct'
    })
  ))

  const notificationIds = notifications
    .map(notification => notification?.id)
    .filter((id): id is string => Boolean(id))

  if (notificationIds.length > 0) {
    await execute(
      `UPDATE office_lobby_requests
       SET notification_ids = $1::uuid[]
       WHERE id = $2`,
      [notificationIds, request.id]
    )
  }

  return {
    ok: true,
    requestId: request.id,
    pendingExpiresAt: request.pending_expires_at,
    notified: fallbackRecipients.length,
    room: zone ? { id: zone.id, slug: zone.slug, name: zone.name } : null,
    meeting: inviteMeeting
      ? {
          id: inviteMeeting.id,
          title: inviteMeeting.title,
          scheduledStartAt,
          durationMinutes: meetingDurationMinutes
        }
      : null
  }
})
