/**
 * GET /api/public/office-recordings/:token
 * Public metadata for ready shared office recordings.
 */
import { queryOne } from '~~/server/utils/db'
import { resolveOfficeRecordingAssetUrl } from '~~/server/utils/officeRecordingAssets'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'
import { verifyPassword } from '~~/server/utils/auth'
import type { OfficeRecordingRow } from '~~/app/types/office'

type PublicRecordingRow = Pick<
  OfficeRecordingRow,
  | 'id'
  | 'title'
  | 'description'
  | 'status'
  | 'access'
  | 'storage_key'
  | 'thumbnail_key'
  | 'password_hash'
  | 'duration_seconds'
  | 'transcript'
  | 'summary'
  | 'chapters'
  | 'view_count'
  | 'created_at'
  | 'updated_at'
> & {
  meeting_session_id: string | null
  meeting_title: string | null
  office_name: string | null
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'token required' })
  }

  const query = getQuery(event)
  const headerPassword = getHeader(event, 'x-recording-password')
  const password = typeof headerPassword === 'string' && headerPassword
    ? headerPassword
    : typeof query.password === 'string' ? query.password : ''
  await ensureOfficeRecordingsTables()
  const recording = await queryOne<PublicRecordingRow>(
    `SELECT r.id,
            r.title,
            r.description,
            r.status,
            r.access,
            r.storage_key,
            r.thumbnail_key,
            r.password_hash,
            r.duration_seconds,
            r.transcript,
            r.summary,
            r.chapters,
            r.view_count,
            r.created_at,
            r.updated_at,
            r.meeting_session_id,
            oms.title AS meeting_title,
            o.name AS office_name
     FROM office_recordings r
     LEFT JOIN office_meeting_sessions oms
       ON oms.id = r.meeting_session_id
      AND oms.office_id = r.office_id
     LEFT JOIN offices o ON o.id = r.office_id
     WHERE r.share_token = $1
       AND r.access IN ('public', 'password')
       AND r.status = 'ready'
       AND r.storage_key IS NOT NULL
     LIMIT 1`,
    [token]
  )

  if (!recording) {
    throw createError({ statusCode: 404, statusMessage: 'Recording not found' })
  }
  if (recording.access === 'password') {
    if (!recording.password_hash || !password || !await verifyPassword(password, recording.password_hash)) {
      throw createError({ statusCode: 401, statusMessage: 'Recording password required' })
    }
  }

  const actionItemsArtifact = recording.meeting_session_id
    ? await queryOne<{ content: string }>(
        `SELECT content
         FROM office_meeting_artifacts
         WHERE meeting_session_id = $1
           AND artifact_type = 'action_items'
           AND metadata->>'source' = 'office_recording_transcription'
           AND metadata->>'recording_id' = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [recording.meeting_session_id, recording.id]
      )
    : null

  const {
    storage_key: _storageKey,
    thumbnail_key: _thumbnailKey,
    password_hash: _passwordHash,
    meeting_session_id: _meetingSessionId,
    ...publicRecording
  } = recording
  return {
    recording: {
      ...publicRecording,
      action_items: actionItemsArtifact?.content ?? '',
      media_url: await resolveOfficeRecordingAssetUrl(recording.storage_key),
      thumbnail_url: await resolveOfficeRecordingAssetUrl(recording.thumbnail_key)
    }
  }
})
