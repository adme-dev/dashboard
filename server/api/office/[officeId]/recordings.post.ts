/**
 * POST /api/office/:officeId/recordings
 * Create recording metadata; actual media upload/storage plugs in later.
 */
import { z } from 'zod'
import { hashPassword, requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'
import { getOfficeSettings, isPublicRecordingAccess } from '~~/server/utils/officeSettings'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { ensureOfficeRecordingThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeMeetingSessionRow, OfficeMemberRow, OfficeRecordingRow } from '~~/app/types/office'

const Body = z.object({
  meeting_session_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(800).optional(),
  access: z.enum(['private', 'workspace', 'public', 'password']).default('workspace'),
  password: z.string().min(8).max(200).optional(),
  storage_key: z.string().trim().max(500).nullable().optional(),
  thumbnail_key: z.string().trim().max(500).nullable().optional(),
  duration_seconds: z.number().int().positive().nullable().optional(),
  transcript: z.string().max(200_000).optional(),
  summary: z.string().max(20_000).optional(),
  chapters: z.array(z.object({
    title: z.string().max(120),
    start_seconds: z.number().int().nonnegative()
  })).default([]),
  retention_days: z.number().int().min(1).max(3650).nullable().optional()
})

function recordingCreatedThreadContent(recording: OfficeRecordingRow) {
  return [
    `Recording created: ${recording.title}`,
    recording.description?.trim() || null,
    recording.meeting_session_id ? 'Linked to a meeting session' : 'Async recording'
  ].filter(Boolean).join('\n\n')
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

  await ensureOfficeRecordingsTables()
  const body = Body.parse(await readBody(event))
  const settings = await getOfficeSettings(officeId)
  if (!settings?.recording_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Recordings are disabled for this office' })
  }
  if (body.access === 'password' && !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Password links require a password' })
  }
  if (isPublicRecordingAccess(body.access) && !settings.public_recording_links_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Public recording links are disabled for this office' })
  }

  if (body.meeting_session_id) {
    const meeting = await queryOne<Pick<OfficeMeetingSessionRow, 'id'>>(
      `SELECT id
       FROM office_meeting_sessions
       WHERE id = $1
         AND office_id = $2`,
      [body.meeting_session_id, officeId]
    )
    if (!meeting) {
      throw createError({ statusCode: 404, statusMessage: 'Meeting session not found' })
    }
  }

  const recording = await queryOne<OfficeRecordingRow>(
    `INSERT INTO office_recordings (
       office_id, meeting_session_id, title, description, status, access,
       storage_key, thumbnail_key, duration_seconds, transcript, summary,
       chapters, retention_days, share_token, password_hash, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      officeId,
      body.meeting_session_id ?? null,
      body.title,
      body.description ?? '',
      body.storage_key ? 'processing' : 'draft',
      body.access,
      body.storage_key ?? null,
      body.thumbnail_key ?? null,
      body.duration_seconds ?? null,
      body.transcript ?? '',
      body.summary ?? '',
      JSON.stringify(body.chapters),
      body.retention_days ?? settings.default_recording_retention_days,
      null,
      body.access === 'password' && body.password ? await hashPassword(body.password) : null,
      user.id
    ]
  )

  if (!recording) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create recording' })
  }

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'recording.created',
    targetType: 'office_recording',
    targetId: recording.id,
    metadata: {
      access: recording.access,
      retentionDays: recording.retention_days,
      meetingSessionId: recording.meeting_session_id
    }
  })

  try {
    const channel = await ensureOfficeRecordingThreadChannel({
      officeId,
      recordingId: recording.id,
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
          recordingCreatedThreadContent(recording),
          JSON.stringify({
            source: 'office_recording',
            event: 'recording_created',
            recording_id: recording.id,
            meeting_id: recording.meeting_session_id,
            access: recording.access,
            status: recording.status
          })
        ]
      )
    }
  } catch (error) {
    console.warn('[office-recording] could not write recording thread event:', error)
  }

  return { recording }
})
