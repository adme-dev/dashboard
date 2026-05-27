/**
 * POST /api/office/:officeId/recordings/:recordingId/transcribe
 * Transcribe uploaded recording media and attach transcript/summary/action artifacts.
 */
import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'
import { getOfficeSettings } from '~~/server/utils/officeSettings'
import { transcribeOfficeRecording } from '~~/server/utils/officeTranscription'
import type { OfficeMemberRow, OfficeRecordingRow } from '~~/app/types/office'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not transcribe recording'
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

  const settings = await getOfficeSettings(officeId)
  if (!settings?.ai_notes_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'AI notes are disabled for this office' })
  }
  if (!settings.recording_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Recordings are disabled for this office' })
  }

  await ensureOfficeRecordingsTables()
  const recording = await queryOne<OfficeRecordingRow>(
    `SELECT *
     FROM office_recordings
     WHERE id = $1
       AND office_id = $2`,
    [recordingId, officeId]
  )
  if (!recording) {
    throw createError({ statusCode: 404, statusMessage: 'Recording not found' })
  }
  if (!recording.storage_key) {
    throw createError({ statusCode: 400, statusMessage: 'Attach recording media before transcribing' })
  }
  if (recording.status === 'archived') {
    throw createError({ statusCode: 400, statusMessage: 'Archived recordings cannot be transcribed' })
  }

  await execute(
    `UPDATE office_recordings
     SET status = 'processing',
         updated_at = now()
     WHERE id = $1
       AND office_id = $2`,
    [recordingId, officeId]
  )

  try {
    const result = await transcribeOfficeRecording({
      officeId,
      recording,
      actorId: user.id
    })

    await logOfficeAuditEvent({
      officeId,
      actorId: user.id,
      action: 'recording.transcribed',
      targetType: 'office_recording',
      targetId: recording.id,
      metadata: {
        meetingSessionId: recording.meeting_session_id,
        transcriptLength: result.transcript.length,
        summaryLength: result.summary.length,
        artifactIds: {
          transcript: result.artifacts.transcript?.id,
          summary: result.artifacts.summary?.id,
          actionItems: result.artifacts.actionItems?.id
        }
      }
    })

    return result
  } catch (error: unknown) {
    const message = errorMessage(error)
    await execute(
      `UPDATE office_recordings
       SET status = 'failed',
           updated_at = now()
       WHERE id = $1
         AND office_id = $2`,
      [recordingId, officeId]
    )
    await logOfficeAuditEvent({
      officeId,
      actorId: user.id,
      action: 'recording.transcription_failed',
      targetType: 'office_recording',
      targetId: recording.id,
      metadata: {
        meetingSessionId: recording.meeting_session_id,
        error: message
      }
    })
    throw createError({
      statusCode: 500,
      statusMessage: message
    })
  }
})
