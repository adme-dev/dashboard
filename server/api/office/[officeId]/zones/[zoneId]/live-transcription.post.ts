/**
 * POST /api/office/:officeId/zones/:zoneId/live-transcription
 * Transcribe a short live audio segment and append it to the room meeting transcript.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getOfficeSettings } from '~~/server/utils/officeSettings'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficeMeetingThreadChannel } from '~~/server/utils/officeThreads'
import { transcribeGroqAudio } from '~~/server/utils/groqClient'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import type { OfficeMeetingArtifactRow, OfficeMeetingSessionRow, OfficeMemberRow, OfficeZoneRow } from '~~/app/types/office'

const MAX_LIVE_AUDIO_CHUNK_SIZE = 10 * 1024 * 1024
const MIN_LIVE_AUDIO_CHUNK_SIZE = 200
const LIVE_TRANSCRIPT_SOURCE = 'office_live_transcription'

type LiveTranscriptionResponse = {
  meetingId: string
  artifact: OfficeMeetingArtifactRow
  transcript: string
  skipped?: boolean
}

function fieldValue(formData: Awaited<ReturnType<typeof readMultipartFormData>>, name: string) {
  return formData?.find(field => field.name === name)?.data?.toString('utf-8').trim() ?? ''
}

function numericMetadata(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

async function currentOrCreateMeeting(input: {
  officeId: string
  zoneId: string
  userId: string
}) {
  const userHandle = `user:${input.userId}`
  const liveConsent = JSON.stringify({ ai_notes: true, transcript: true, live_transcription: true })
  const existing = await queryOne<OfficeMeetingSessionRow>(
    `SELECT *
     FROM office_meeting_sessions
     WHERE office_id = $1
       AND zone_id = $2
       AND status IN ('live', 'planned')
     ORDER BY
       CASE WHEN status = 'live' THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT 1`,
    [input.officeId, input.zoneId]
  )
  if (existing) {
    const updated = await queryOne<OfficeMeetingSessionRow>(
      `UPDATE office_meeting_sessions
       SET status = 'live',
           started_at = COALESCE(started_at, now()),
           consent = consent || $2::jsonb,
           participant_handles = CASE
             WHEN participant_handles @> ARRAY[$3]::text[] THEN participant_handles
             ELSE participant_handles || $3
           END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [existing.id, liveConsent, userHandle]
    )
    if (updated) return updated
    return existing
  }

  const zone = await queryOne<Pick<OfficeZoneRow, 'name'>>(
    `SELECT name
     FROM office_zones
     WHERE id = $1
       AND office_id = $2`,
    [input.zoneId, input.officeId]
  )

  return queryOne<OfficeMeetingSessionRow>(
    `INSERT INTO office_meeting_sessions (
       office_id, zone_id, source, status, title, participant_handles, consent, started_at, created_by
     )
     VALUES ($1, $2, 'drop_in', 'live', $3, ARRAY[$4]::text[], $5, now(), $6)
     RETURNING *`,
    [
      input.officeId,
      input.zoneId,
      `${zone?.name ?? 'Room'} live notes`,
      userHandle,
      liveConsent,
      input.userId
    ]
  )
}

async function appendTranscriptArtifact(input: {
  meetingId: string
  transcript: string
  sequence: number
  final: boolean
  userId: string
}) {
  const existing = await queryOne<OfficeMeetingArtifactRow>(
    `SELECT *
     FROM office_meeting_artifacts
     WHERE meeting_session_id = $1
       AND artifact_type = 'transcript'
       AND metadata->>'source' = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.meetingId, LIVE_TRANSCRIPT_SOURCE]
  )

  const stampedText = input.transcript
    ? `[${new Date().toISOString()}] ${input.transcript}`
    : ''

  if (existing) {
    const content = stampedText
      ? [existing.content.trim(), stampedText].filter(Boolean).join('\n\n')
      : existing.content
    const nextSegmentCount = numericMetadata(existing.metadata?.segment_count) + (input.transcript ? 1 : 0)
    const now = new Date().toISOString()

    const artifact = await queryOne<OfficeMeetingArtifactRow>(
      `UPDATE office_meeting_artifacts
       SET content = $2,
           metadata = metadata || $3::jsonb
       WHERE id = $1
       RETURNING *`,
      [
        existing.id,
        content,
        JSON.stringify({
          live_status: input.final ? 'finalized' : 'recording',
          segment_count: nextSegmentCount,
          last_sequence: input.sequence,
          last_transcribed_at: input.transcript ? now : existing.metadata?.last_transcribed_at,
          finalized_at: input.final ? now : existing.metadata?.finalized_at
        })
      ]
    )
    if (!artifact) throw new Error('Could not update live transcript artifact')
    return artifact
  }

  const artifact = await queryOne<OfficeMeetingArtifactRow>(
    `INSERT INTO office_meeting_artifacts (
       meeting_session_id, artifact_type, title, content, metadata, created_by
     )
     VALUES ($1, 'transcript', $2, $3, $4, $5)
     RETURNING *`,
    [
      input.meetingId,
      'Live transcript',
      stampedText,
      JSON.stringify({
        source: LIVE_TRANSCRIPT_SOURCE,
        live_status: input.final ? 'finalized' : 'recording',
        segment_count: input.transcript ? 1 : 0,
        first_sequence: input.sequence,
        last_sequence: input.sequence,
        last_transcribed_at: input.transcript ? new Date().toISOString() : null,
        finalized_at: input.final ? new Date().toISOString() : null
      }),
      input.userId
    ]
  )
  if (!artifact) throw new Error('Could not create live transcript artifact')
  return artifact
}

async function writeLiveTranscriptThreadEvent(input: {
  officeId: string
  meetingId: string
  artifact: OfficeMeetingArtifactRow
  actorId: string
}) {
  if (!input.artifact.content.trim()) return

  const channel = await ensureOfficeMeetingThreadChannel({
    officeId: input.officeId,
    meetingId: input.meetingId,
    actorId: input.actorId
  })
  if (!channel) return

  const segmentCount = numericMetadata(input.artifact.metadata?.segment_count)
  await queryOne(
    `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      channel.id,
      input.actorId,
      [
        'Live AI notes were saved for this meeting.',
        `${segmentCount} transcript segment${segmentCount === 1 ? '' : 's'} are ready in meeting artifacts.`
      ].join('\n\n'),
      JSON.stringify({
        source: LIVE_TRANSCRIPT_SOURCE,
        meeting_id: input.meetingId,
        artifact_id: input.artifact.id,
        artifact_type: input.artifact.artifact_type,
        segment_count: segmentCount
      })
    ]
  )
}

export default defineEventHandler(async (event): Promise<LiveTranscriptionResponse> => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const zoneId = getRouterParam(event, 'zoneId')
  if (!officeId || !zoneId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and zoneId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT *
     FROM office_members
     WHERE office_id = $1
       AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  const settings = await getOfficeSettings(officeId)
  if (!settings?.ai_notes_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'AI notes are disabled for this office' })
  }

  await ensureOfficeMeetingArtifactsTables()

  const formData = await readMultipartFormData(event)
  const audio = formData?.find(field => field.name === 'audio')
  const sequence = Number(fieldValue(formData, 'sequence') || '0')
  const final = fieldValue(formData, 'final') === 'true'

  const meeting = await currentOrCreateMeeting({
    officeId,
    zoneId,
    userId: user.id
  })
  if (!meeting) {
    throw createError({ statusCode: 500, statusMessage: 'Could not prepare meeting session' })
  }

  if (!audio?.data || audio.data.length < MIN_LIVE_AUDIO_CHUNK_SIZE) {
    const artifact = await appendTranscriptArtifact({
      meetingId: meeting.id,
      transcript: '',
      sequence,
      final,
      userId: user.id
    })
    if (final) {
      try {
        await writeLiveTranscriptThreadEvent({
          officeId,
          meetingId: meeting.id,
          artifact,
          actorId: user.id
        })
      } catch (error) {
        console.warn('[office-live-transcription] could not write meeting thread event:', error)
      }
    }
    return { meetingId: meeting.id, artifact, transcript: '', skipped: true }
  }

  const mediaType = audio.type || 'audio/webm'
  if (!mediaType.startsWith('audio/') && mediaType !== 'video/webm') {
    throw createError({ statusCode: 400, statusMessage: 'Live notes require an audio segment' })
  }
  if (audio.data.length > MAX_LIVE_AUDIO_CHUNK_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Live audio segment is too large' })
  }

  const transcript = await transcribeGroqAudio({
    buffer: audio.data,
    filename: audio.filename || `live-audio-${sequence}.webm`,
    contentType: mediaType,
    prompt: 'Transcribe this short live meeting audio segment. Return only spoken words.'
  })

  const artifact = await appendTranscriptArtifact({
    meetingId: meeting.id,
    transcript,
    sequence,
    final,
    userId: user.id
  })

  if (final) {
    try {
      await writeLiveTranscriptThreadEvent({
        officeId,
        meetingId: meeting.id,
        artifact,
        actorId: user.id
      })
    } catch (error) {
      console.warn('[office-live-transcription] could not write meeting thread event:', error)
    }
  }

  if (transcript) {
    await logOfficeAuditEvent({
      officeId,
      actorId: user.id,
      action: 'meeting.live_transcribed',
      targetType: 'office_meeting_session',
      targetId: meeting.id,
      metadata: {
        zoneId,
        artifactId: artifact.id,
        sequence,
        transcriptLength: transcript.length
      }
    })
  }

  return {
    meetingId: meeting.id,
    artifact,
    transcript
  }
})
