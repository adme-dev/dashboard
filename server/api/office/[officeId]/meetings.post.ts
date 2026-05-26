/**
 * POST /api/office/:officeId/meetings
 * Create a meeting session placeholder for notes, recordings, and follow-up.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { ensureOfficeLobbiesTable } from '~~/server/utils/officeLobbies'
import { ensureOfficeLobbyRequestsTable } from '~~/server/utils/officeLobbyRequests'
import { createMeetingPlaceholderArtifacts, ensureOfficeMeetingArtifactsTables, meetingArtifactTemplate } from '~~/server/utils/officeMeetingArtifacts'
import { normalizeOfficeMeetingGuestEmails } from '~~/server/utils/officeMeetingGuests'
import { getOfficeSettings } from '~~/server/utils/officeSettings'
import type { OfficeMeetingSessionRow, OfficeMemberRow } from '~~/app/types/office'

const GuestEmail = z.string().trim().email()

const Body = z.object({
  zone_id: z.string().uuid().nullable().optional(),
  lobby_request_id: z.string().uuid().nullable().optional(),
  lobby_id: z.string().uuid().nullable().optional(),
  source: z.enum(['drop_in', 'lobby', 'scheduled']).default('drop_in'),
  status: z.enum(['planned', 'live', 'ended', 'cancelled']).default('planned'),
  title: z.string().trim().min(1).max(160),
  meeting_type: z.enum(['general', 'client_review', 'sales_call', 'support', 'standup', 'interview', 'all_hands']).default('general'),
  context: z.string().trim().max(4000).default(''),
  intake_prompt: z.string().trim().max(280).nullable().optional(),
  scheduled_start_at: z.string().datetime().nullable().optional(),
  duration_minutes: z.number().int().min(15).max(480).nullable().optional(),
  participant_handles: z.array(z.string().regex(/^(user|client):.+$/)).default([]),
  guest_emails: z.array(GuestEmail).default([]),
  consent: z.object({
    ai_notes: z.boolean().optional(),
    recording: z.boolean().optional(),
    transcript: z.boolean().optional()
  }).default({}),
  retention_days: z.number().int().positive().nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  create_placeholders: z.boolean().default(true)
})

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

  const body = Body.parse(await readBody(event))
  if (body.lobby_request_id) await ensureOfficeLobbyRequestsTable()
  if (body.lobby_id) await ensureOfficeLobbiesTable()
  await ensureOfficeMeetingArtifactsTables()
  const settings = await getOfficeSettings(officeId)
  if (body.consent.recording && !settings?.recording_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Recordings are disabled for this office' })
  }
  if (body.consent.ai_notes && !settings?.ai_notes_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'AI notes are disabled for this office' })
  }
  if (body.status === 'live' && !body.zone_id) {
    throw createError({ statusCode: 400, statusMessage: 'Live meetings require a room' })
  }
  if (body.zone_id) {
    const zone = await queryOne<{ id: string }>(
      `SELECT id
       FROM office_zones
       WHERE id = $1
         AND office_id = $2
         AND zone_type <> 'desk'`,
      [body.zone_id, officeId]
    )
    if (!zone) {
      throw createError({ statusCode: 404, statusMessage: 'Meeting room not found' })
    }
  }
  if (body.lobby_request_id) {
    const lobbyRequest = await queryOne<{ id: string }>(
      `SELECT id
       FROM office_lobby_requests
       WHERE id = $1
         AND office_id = $2`,
      [body.lobby_request_id, officeId]
    )
    if (!lobbyRequest) {
      throw createError({ statusCode: 404, statusMessage: 'Lobby request not found' })
    }
  }
  if (body.lobby_id) {
    const lobby = await queryOne<{ id: string }>(
      `SELECT id
       FROM office_lobbies
       WHERE id = $1
         AND office_id = $2`,
      [body.lobby_id, officeId]
    )
    if (!lobby) {
      throw createError({ statusCode: 404, statusMessage: 'Lobby not found' })
    }
  }
  const sessionConsent = {
    ...body.consent,
    setup: {
      meeting_type: body.meeting_type,
      context: body.context,
      intake_prompt: body.intake_prompt ?? null,
      scheduled_start_at: body.scheduled_start_at ?? null,
      duration_minutes: body.duration_minutes ?? null
    }
  }
  const startedAt = body.started_at ?? (body.status === 'live' ? new Date().toISOString() : null)
  const guestEmails = normalizeOfficeMeetingGuestEmails(body.guest_emails)

  const session = await queryOne<OfficeMeetingSessionRow>(
    `INSERT INTO office_meeting_sessions (
       office_id, zone_id, lobby_request_id, lobby_id, source, status, title,
       participant_handles, guest_emails, consent, retention_days, started_at, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[], $10, $11, $12, $13)
     RETURNING *`,
    [
      officeId,
      body.zone_id ?? null,
      body.lobby_request_id ?? null,
      body.lobby_id ?? null,
      body.source,
      body.status,
      body.title,
      body.participant_handles,
      guestEmails,
      JSON.stringify(sessionConsent),
      body.retention_days ?? settings?.default_meeting_retention_days ?? null,
      startedAt,
      user.id
    ]
  )

  if (!session) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create meeting session' })
  }

  if (body.create_placeholders) {
    const template = meetingArtifactTemplate(body.meeting_type)
    await createMeetingPlaceholderArtifacts({
      meetingSessionId: session.id,
      title: body.title,
      notesContent: body.context,
      summaryContent: template.summaryContent,
      actionItemsContent: template.actionItemsContent,
      metadata: {
        status: 'placeholder',
        meeting_type: body.meeting_type,
        guest_emails: guestEmails,
        participant_handles: body.participant_handles
      },
      createdBy: user.id
    })
  }

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'meeting.created',
    targetType: 'office_meeting_session',
    targetId: session.id,
    metadata: {
      title: body.title,
      source: body.source,
      status: body.status,
      zone_id: body.zone_id ?? null,
      meeting_type: body.meeting_type,
      intake_prompt: body.intake_prompt ?? null,
      scheduled_start_at: body.scheduled_start_at ?? null,
      duration_minutes: body.duration_minutes ?? null,
      guest_count: guestEmails.length,
      retention_days: body.retention_days ?? settings?.default_meeting_retention_days ?? null,
      started_at: startedAt,
      create_placeholders: body.create_placeholders
    }
  })

  return { session }
})
