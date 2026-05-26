import { queryOne } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeRecordingRow } from '~~/app/types/office'

export async function attachReadyRecordingArtifact(recording: OfficeRecordingRow, actorId: string) {
  if (!recording.meeting_session_id || recording.status !== 'ready') return

  await ensureOfficeMeetingArtifactsTables()
  const recordingLink = recording.share_token ? `/recordings/${recording.share_token}` : null
  await queryOne(
    `INSERT INTO office_meeting_artifacts (
       meeting_session_id, artifact_type, title, content, metadata, created_by
     )
     SELECT $1, 'recording', $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1
       FROM office_meeting_artifacts
       WHERE meeting_session_id = $1
         AND metadata->>'recording_id' = $6
     )
     RETURNING id`,
    [
      recording.meeting_session_id,
      `${recording.title} recording`,
      [
        recording.summary || recording.description || 'Recording is ready for review.',
        recordingLink ? `Shared link: ${recordingLink}` : ''
      ].filter(Boolean).join('\n'),
      JSON.stringify({
        status: 'generated',
        source: 'office_recording',
        recording_id: recording.id,
        recording_status: recording.status,
        recording_access: recording.access,
        share_token: recording.share_token,
        duration_seconds: recording.duration_seconds
      }),
      actorId,
      recording.id
    ]
  )
}
