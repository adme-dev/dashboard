/**
 * POST /api/office/:officeId/meetings/:meetingId/invite
 * Sends the external lobby invite to a meeting's guest list.
 */
import { z } from 'zod'
import type { H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getAppUrl } from '~~/server/utils/appUrl'
import { sendOfficeMeetingInviteEmail } from '~~/server/utils/email'
import { queryOne } from '~~/server/utils/db'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { ensureOfficeLobbiesTable } from '~~/server/utils/officeLobbies'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { normalizeOfficeMeetingGuestEmails } from '~~/server/utils/officeMeetingGuests'
import { ensureOfficeMeetingThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeMeetingSessionRow, OfficeMemberRow } from '~~/app/types/office'

type MeetingInviteRow = Pick<
  OfficeMeetingSessionRow,
  'id' | 'title' | 'zone_id' | 'guest_emails' | 'consent'
> & {
  zone_name: string | null
  zone_slug: string | null
  consent: OfficeMeetingSessionRow['consent'] & {
    setup?: {
      scheduled_start_at?: string | null
      duration_minutes?: number | null
      intake_prompt?: string | null
    }
  }
}

const GuestEmail = z.string().trim().email()

const Body = z.object({
  invite_url: z.string().trim().min(1).max(2048).optional(),
  recipients: z.array(GuestEmail).optional(),
  note: z.string().trim().max(1200).optional()
})

function absoluteInviteUrl(event: H3Event, value: string) {
  const appUrl = getAppUrl(event).replace(/\/$/, '')
  if (/^https?:\/\//i.test(value)) {
    const appOrigin = new URL(appUrl).origin
    const inviteOrigin = new URL(value).origin
    if (inviteOrigin !== appOrigin) {
      throw createError({ statusCode: 400, statusMessage: 'Invite URL must use this app domain' })
    }
    return value
  }
  const path = value.startsWith('/') ? value : `/${value}`
  return `${appUrl}${path}`
}

function inviteUrlMeetingId(value: string) {
  try {
    const url = new URL(value, 'https://office.local')
    return url.searchParams.get('meeting')
  } catch {
    return null
  }
}

async function generatedInvitePath(officeId: string, meeting: MeetingInviteRow) {
  await ensureOfficeLobbiesTable()
  const lobby = await queryOne<{ handle: string }>(
    `SELECT handle
     FROM office_lobbies
     WHERE office_id = $1
       AND is_active = true
       AND (
         destination_zone_id = $2
         OR destination_zone_id IS NULL
       )
     ORDER BY
       CASE WHEN destination_zone_id = $2 THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT 1`,
    [officeId, meeting.zone_id]
  )
  const query = new URLSearchParams()
  if (meeting.zone_slug) query.set('room', meeting.zone_slug)
  query.set('meeting', meeting.id)
  query.set('title', meeting.title)
  const setup = meeting.consent?.setup
  if (setup?.scheduled_start_at) query.set('start', setup.scheduled_start_at)
  if (setup?.duration_minutes) query.set('duration', String(setup.duration_minutes))

  return `${lobby?.handle ? `/l/${lobby.handle}` : `/lobby/${officeId}`}?${query.toString()}`
}

function setupScheduleLabel(meeting: MeetingInviteRow) {
  const setup = meeting.consent?.setup
  if (!setup || typeof setup !== 'object') return ''
  const scheduledStartAt = 'scheduled_start_at' in setup && typeof setup.scheduled_start_at === 'string'
    ? setup.scheduled_start_at
    : ''
  if (!scheduledStartAt) return ''
  const date = new Date(scheduledStartAt)
  if (Number.isNaN(date.getTime())) return ''
  const when = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
  const duration = 'duration_minutes' in setup && typeof setup.duration_minutes === 'number'
    ? setup.duration_minutes
    : null
  return duration ? `${when} · ${duration} min` : when
}

function inviteThreadContent(input: {
  meeting: MeetingInviteRow
  recipients: string[]
  inviteUrl: string
}) {
  return [
    `Sent guest invites: ${input.meeting.title}`,
    `${input.recipients.length} guest${input.recipients.length === 1 ? '' : 's'} invited`,
    input.recipients.join(', '),
    input.inviteUrl
  ].filter(Boolean).join('\n')
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')
  if (!officeId || !meetingId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and meetingId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  const body = Body.parse(await readBody(event))
  await ensureOfficeMeetingArtifactsTables()
  const meeting = await queryOne<MeetingInviteRow>(
    `SELECT oms.id,
            oms.title,
            oms.zone_id,
            oms.guest_emails,
            oms.consent,
            oz.name AS zone_name,
            oz.slug AS zone_slug
     FROM office_meeting_sessions oms
     LEFT JOIN office_zones oz ON oz.id = oms.zone_id
     WHERE oms.id = $1
       AND oms.office_id = $2`,
    [meetingId, officeId]
  )
  if (!meeting) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting session not found' })
  }
  if (!meeting.zone_id) {
    throw createError({ statusCode: 400, statusMessage: 'Assign a room before sending guest invites' })
  }

  const meetingGuests = new Set(normalizeOfficeMeetingGuestEmails(meeting.guest_emails ?? []))
  const recipients = normalizeOfficeMeetingGuestEmails(body.recipients ?? meeting.guest_emails ?? [])
  if (!recipients.length) {
    throw createError({ statusCode: 400, statusMessage: 'Meeting has no guest emails to invite' })
  }
  const unknownRecipients = recipients.filter(email => !meetingGuests.has(email))
  if (unknownRecipients.length) {
    throw createError({ statusCode: 400, statusMessage: 'Recipients must belong to this meeting guest list' })
  }

  const inviteUrl = absoluteInviteUrl(event, body.invite_url ?? await generatedInvitePath(officeId, meeting))
  if (inviteUrlMeetingId(inviteUrl) !== meeting.id) {
    throw createError({ statusCode: 400, statusMessage: 'Invite URL must point to this meeting' })
  }
  const invitedAt = new Date().toISOString()
  await Promise.all(recipients.map(recipient => sendOfficeMeetingInviteEmail({
    to: recipient,
    meetingTitle: meeting.title,
    inviteUrl,
    scheduleLabel: setupScheduleLabel(meeting),
    roomName: meeting.zone_name,
    note: body.note
  }, event)))

  await queryOne(
    `UPDATE office_meeting_sessions
     SET consent = COALESCE(consent, '{}'::jsonb) || jsonb_build_object('invite_delivery', $3::jsonb),
         updated_at = now()
     WHERE id = $1
       AND office_id = $2
     RETURNING id`,
    [
      meetingId,
      officeId,
      JSON.stringify({
        status: 'sent',
        sent_at: invitedAt,
        recipients,
        guest_count: recipients.length,
        invite_url: inviteUrl,
        intake_prompt: meeting.consent?.setup?.intake_prompt ?? null,
        sent_by: user.id
      })
    ]
  )

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'meeting.invites_sent',
    targetType: 'office_meeting_session',
    targetId: meeting.id,
    metadata: {
      guest_count: recipients.length,
      invite_url: inviteUrl,
      intake_prompt: meeting.consent?.setup?.intake_prompt ?? null,
      sent_at: invitedAt
    }
  })

  try {
    const channel = await ensureOfficeMeetingThreadChannel({
      officeId,
      meetingId,
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
          inviteThreadContent({ meeting, recipients, inviteUrl }),
          JSON.stringify({
            source: 'office_meeting_invites',
            meeting_id: meetingId,
            guest_count: recipients.length,
            invite_url: inviteUrl,
            sent_at: invitedAt
          })
        ]
      )
    }
  } catch (error) {
    console.warn('[office-meeting-invite] could not write meeting thread event:', error)
  }

  return { invited: recipients.length, invitedAt }
})
