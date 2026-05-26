/**
 * PATCH /api/office/:officeId/recordings/:recordingId
 * Update office recording metadata and lifecycle state.
 */
import { z } from 'zod'
import { hashPassword, requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { attachReadyRecordingArtifact } from '~~/server/utils/officeRecordingArtifacts'
import { ensureOfficeRecordingsTables, generateOfficeRecordingShareToken } from '~~/server/utils/officeRecordings'
import { getOfficeSettings, isPublicRecordingAccess } from '~~/server/utils/officeSettings'
import type { OfficeMemberRow, OfficeRecordingAccess, OfficeRecordingRow, OfficeRecordingStatus } from '~~/app/types/office'

const Body = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(800).optional(),
  status: z.enum(['draft', 'processing', 'ready', 'failed', 'archived']).optional(),
  access: z.enum(['private', 'workspace', 'public', 'password']).optional(),
  password: z.string().min(8).max(200).optional(),
  storage_key: z.string().trim().max(500).nullable().optional(),
  thumbnail_key: z.string().trim().max(500).nullable().optional(),
  duration_seconds: z.number().int().positive().nullable().optional(),
  transcript: z.string().max(200_000).optional(),
  summary: z.string().max(20_000).optional(),
  chapters: z.array(z.object({
    title: z.string().max(120),
    start_seconds: z.number().int().nonnegative()
  })).optional(),
  retention_days: z.number().int().min(1).max(3650).nullable().optional()
})

function nextShareToken(current: OfficeRecordingRow, status: OfficeRecordingStatus, storageKey: string | null, access?: OfficeRecordingAccess) {
  if (status === 'archived') return null
  if (status !== 'ready') return null
  if (!storageKey) return null
  const finalAccess = access ?? current.access
  if (!isPublicRecordingAccess(finalAccess)) return null
  return current.share_token ?? generateOfficeRecordingShareToken()
}

function finalStatus(current: OfficeRecordingRow, requested?: OfficeRecordingStatus) {
  if (requested) return requested
  return current.status
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const recordingId = getRouterParam(event, 'recordingId')
  if (!officeId || !recordingId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and recordingId are required' })
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
  const existing = await queryOne<OfficeRecordingRow>(
    `SELECT *
     FROM office_recordings
     WHERE id = $1
       AND office_id = $2`,
    [recordingId, officeId]
  )
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Recording not found' })
  }

  const settings = await getOfficeSettings(officeId)
  if (!settings?.recording_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Recordings are disabled for this office' })
  }
  if (body.access && isPublicRecordingAccess(body.access) && !settings.public_recording_links_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Public recording links are disabled for this office' })
  }

  const status = finalStatus(existing, body.status)
  const storageKey = body.storage_key ?? existing.storage_key
  const access = body.access ?? existing.access
  if (access === 'password' && !body.password && !existing.password_hash) {
    throw createError({ statusCode: 400, statusMessage: 'Password links require a password' })
  }
  if (status === 'ready' && isPublicRecordingAccess(access) && !storageKey) {
    throw createError({ statusCode: 400, statusMessage: 'Attach recording media before enabling a public link' })
  }
  const shareToken = nextShareToken(existing, status, storageKey, body.access)
  const shouldUpdatePasswordHash = Boolean(body.password) || (body.access !== undefined && body.access !== 'password')
  const passwordHash = body.password ? await hashPassword(body.password) : null
  const recording = await queryOne<OfficeRecordingRow>(
    `UPDATE office_recordings
     SET title = COALESCE($3, title),
         description = COALESCE($4, description),
         status = $5,
         access = COALESCE($6, access),
         storage_key = COALESCE($7, storage_key),
         thumbnail_key = COALESCE($8, thumbnail_key),
         duration_seconds = COALESCE($9, duration_seconds),
         transcript = COALESCE($10, transcript),
         summary = COALESCE($11, summary),
         chapters = COALESCE($12::jsonb, chapters),
         retention_days = COALESCE($13, retention_days),
         share_token = $14,
         password_hash = CASE WHEN $15::boolean THEN $16 ELSE password_hash END,
         updated_at = now()
     WHERE id = $1
       AND office_id = $2
     RETURNING *`,
    [
      recordingId,
      officeId,
      body.title ?? null,
      body.description ?? null,
      status,
      body.access ?? null,
      body.storage_key ?? null,
      body.thumbnail_key ?? null,
      body.duration_seconds ?? null,
      body.transcript ?? null,
      body.summary ?? null,
      body.chapters ? JSON.stringify(body.chapters) : null,
      body.retention_days ?? null,
      shareToken,
      shouldUpdatePasswordHash,
      passwordHash
    ]
  )

  if (!recording) {
    throw createError({ statusCode: 500, statusMessage: 'Could not update recording' })
  }

  await attachReadyRecordingArtifact(recording, user.id)

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: status === 'archived' ? 'recording.archived' : 'recording.updated',
    targetType: 'office_recording',
    targetId: recording.id,
    metadata: {
      status: recording.status,
      access: recording.access,
      retentionDays: recording.retention_days,
      publicLink: Boolean(recording.share_token)
    }
  })

  return { recording }
})
