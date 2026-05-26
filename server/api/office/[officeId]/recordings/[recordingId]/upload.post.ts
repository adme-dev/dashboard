/**
 * POST /api/office/:officeId/recordings/:recordingId/upload
 * Attach uploaded media to an office recording draft.
 */
import { attachReadyRecordingArtifact } from '~~/server/utils/officeRecordingArtifacts'
import { ensureOfficeRecordingsTables, generateOfficeRecordingShareToken } from '~~/server/utils/officeRecordings'
import { getOfficeSettings, isPublicRecordingAccess } from '~~/server/utils/officeSettings'
import { uploadFile } from '~~/server/utils/storage'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import type { OfficeMemberRow, OfficeRecordingRow } from '~~/app/types/office'

const ALLOWED_MEDIA_TYPES = new Set([
  'video/webm',
  'video/mp4',
  'video/quicktime'
])
const MAX_RECORDING_UPLOAD_SIZE = 500 * 1024 * 1024

function safeFileName(value?: string | null) {
  return (value || 'office-recording.webm')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
}

function recordingStorageKey(officeId: string, recordingId: string, filename?: string | null) {
  return `office-recordings/${officeId}/${recordingId}/${Date.now()}-${safeFileName(filename)}`
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
  const settings = await getOfficeSettings(officeId)
  if (!settings?.recording_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Recordings are disabled for this office' })
  }

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
  if (existing.status === 'archived') {
    throw createError({ statusCode: 400, statusMessage: 'Archived recordings cannot be updated' })
  }

  const formData = await readMultipartFormData(event)
  const media = formData?.find(field => field.name === 'file')
  const durationField = formData?.find(field => field.name === 'durationSeconds')
  if (!media) {
    throw createError({ statusCode: 400, statusMessage: 'Recording media file is required' })
  }

  const mediaType = media.type || 'application/octet-stream'
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    throw createError({ statusCode: 400, statusMessage: 'Recording media must be WebM, MP4, or QuickTime video' })
  }
  if (media.data.length > MAX_RECORDING_UPLOAD_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Recording media must be 500MB or smaller' })
  }

  const durationSeconds = Number(durationField?.data?.toString() ?? '')
  const storageKey = recordingStorageKey(officeId, recordingId, media.filename)
  await uploadFile(media.data, storageKey, mediaType, {
    officeId,
    recordingId,
    uploadedBy: user.id,
    originalName: media.filename || 'office-recording'
  })

  const shouldExposeShareLink = isPublicRecordingAccess(existing.access) && settings.public_recording_links_enabled
  const shareToken = shouldExposeShareLink
    ? existing.share_token ?? generateOfficeRecordingShareToken()
    : null
  const recording = await queryOne<OfficeRecordingRow>(
    `UPDATE office_recordings
     SET storage_key = $3,
         duration_seconds = COALESCE($4, duration_seconds),
         status = 'ready',
         share_token = $5,
         updated_at = now()
     WHERE id = $1
       AND office_id = $2
     RETURNING *`,
    [
      recordingId,
      officeId,
      storageKey,
      Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds) : null,
      shareToken
    ]
  )

  if (!recording) {
    throw createError({ statusCode: 500, statusMessage: 'Could not attach recording media' })
  }

  await attachReadyRecordingArtifact(recording, user.id)
  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'recording.media_attached',
    targetType: 'office_recording',
    targetId: recording.id,
    metadata: {
      status: recording.status,
      access: recording.access,
      storageKey,
      durationSeconds: recording.duration_seconds,
      publicLink: Boolean(recording.share_token)
    }
  })

  return { recording }
})
