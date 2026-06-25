import { queryOne } from '~~/server/utils/db'
import { downloadFileBuffer } from '~~/server/utils/storage'
import { generateGroqInsight, GROQ_MODELS, transcribeGroqAudio } from '~~/server/utils/groqClient'
import { createMeetingActionItemsFromArtifact, ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficeMeetingThreadChannel, ensureOfficeRecordingThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeMeetingArtifactRow, OfficeRecordingRow } from '~~/app/types/office'

const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024

function fileNameFromStorageKey(storageKey: string) {
  return storageKey.split('/').pop() || 'office-recording.webm'
}

function contentTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.mov') || lower.endsWith('.qt')) return 'video/quicktime'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  return 'video/webm'
}

function trimForPrompt(value: string, limit = 45_000) {
  return value.length <= limit ? value : `${value.slice(0, limit)}\n\n[Transcript truncated for AI generation.]`
}

function cleanGeneratedMarkdown(value: string) {
  return value
    .trim()
    .replace(/^```(?:markdown|md)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

export async function generateMeetingSummaryFromTranscript(input: {
  title: string
  context?: string
  transcript: string
}) {
  return cleanGeneratedMarkdown(await generateGroqInsight(
    [
      `Meeting/recording title: ${input.title}`,
      input.context ? `Context: ${input.context}` : '',
      '',
      'Transcript:',
      trimForPrompt(input.transcript),
      '',
      'Write a concise meeting summary in markdown with these sections:',
      '- Overview',
      '- Key decisions',
      '- Risks or blockers',
      '- Follow-up context'
    ].filter(Boolean).join('\n'),
    {
      model: GROQ_MODELS.LLAMA_70B,
      temperature: 0.1,
      maxTokens: 1600,
      systemPrompt: 'You summarize business meetings for an agency operations platform. Be specific, factual, and concise. Do not invent details not present in the transcript.',
      featureKey: 'office_recording_transcription',
      metadata: {
        artifact: 'summary',
        hasContext: Boolean(input.context),
        transcriptChars: input.transcript.length,
      },
    }
  ))
}

export async function generateMeetingActionItemsFromTranscript(input: {
  title: string
  transcript: string
}) {
  const response = cleanGeneratedMarkdown(await generateGroqInsight(
    [
      `Meeting/recording title: ${input.title}`,
      '',
      'Transcript:',
      trimForPrompt(input.transcript),
      '',
      'Extract concrete follow-up actions as markdown bullets.',
      'Each bullet should start with an action verb and include an owner only if clearly stated.',
      'If no action items are clearly present, return exactly: No action items identified.'
    ].join('\n'),
    {
      model: GROQ_MODELS.LLAMA_70B,
      temperature: 0,
      maxTokens: 1200,
      systemPrompt: 'You extract meeting action items. Only include actions supported by the transcript. Return bullet points only unless there are no clear actions.',
      featureKey: 'office_recording_transcription',
      metadata: {
        artifact: 'action_items',
        transcriptChars: input.transcript.length,
      },
    }
  ))

  return response || 'No action items identified.'
}

async function insertArtifact(input: {
  meetingId: string
  artifactType: 'transcript' | 'summary' | 'action_items'
  title: string
  content: string
  metadata: Record<string, unknown>
  actorId: string
}) {
  return queryOne<OfficeMeetingArtifactRow>(
    `INSERT INTO office_meeting_artifacts (
       meeting_session_id, artifact_type, title, content, metadata, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.meetingId,
      input.artifactType,
      input.title,
      input.content,
      JSON.stringify(input.metadata),
      input.actorId
    ]
  )
}

async function writeMeetingThreadEvent(input: {
  officeId: string
  meetingId: string
  recording: OfficeRecordingRow
  actorId: string
  transcriptArtifactId?: string
  summaryArtifactId?: string
  actionItemsArtifactId?: string
}) {
  const channel = await ensureOfficeMeetingThreadChannel({
    officeId: input.officeId,
    meetingId: input.meetingId,
    actorId: input.actorId
  })
  if (!channel) return

  await queryOne(
    `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      channel.id,
      input.actorId,
      [
        `AI transcription completed for ${input.recording.title}.`,
        input.transcriptArtifactId ? 'Transcript, summary, and action items were saved to meeting artifacts.' : 'Recording transcript was saved.'
      ].join('\n\n'),
      JSON.stringify({
        source: 'office_recording_transcription',
        recording_id: input.recording.id,
        meeting_id: input.meetingId,
        transcript_artifact_id: input.transcriptArtifactId,
        summary_artifact_id: input.summaryArtifactId,
        action_items_artifact_id: input.actionItemsArtifactId
      })
    ]
  )
}

async function writeRecordingThreadEvent(input: {
  officeId: string
  recording: OfficeRecordingRow
  actorId: string
  transcriptArtifactId?: string
  summaryArtifactId?: string
  actionItemsArtifactId?: string
}) {
  const channel = await ensureOfficeRecordingThreadChannel({
    officeId: input.officeId,
    recordingId: input.recording.id,
    actorId: input.actorId
  })
  if (!channel) return

  await queryOne(
    `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      channel.id,
      input.actorId,
      [
        `AI transcription completed for ${input.recording.title}.`,
        input.summaryArtifactId || input.actionItemsArtifactId
          ? 'Transcript, summary, and action items are ready.'
          : 'Transcript was saved to this recording.'
      ].join('\n\n'),
      JSON.stringify({
        source: 'office_recording_transcription',
        recording_id: input.recording.id,
        meeting_id: input.recording.meeting_session_id,
        transcript_artifact_id: input.transcriptArtifactId,
        summary_artifact_id: input.summaryArtifactId,
        action_items_artifact_id: input.actionItemsArtifactId
      })
    ]
  )
}

export async function transcribeOfficeRecording(input: {
  officeId: string
  recording: OfficeRecordingRow
  actorId: string
}) {
  if (!input.recording.storage_key) {
    throw new Error('Recording media is required before transcription')
  }

  const fileName = fileNameFromStorageKey(input.recording.storage_key)
  const fileBuffer = await downloadFileBuffer(input.recording.storage_key)
  if (fileBuffer.length > MAX_TRANSCRIPTION_BYTES) {
    throw new Error('Recording media is too large for transcription. Trim or split the recording first.')
  }

  const transcript = await transcribeGroqAudio({
    buffer: fileBuffer,
    filename: fileName,
    contentType: contentTypeFromFileName(fileName),
    prompt: input.recording.title
  })

  const summary = transcript
    ? await generateMeetingSummaryFromTranscript({
        title: input.recording.title,
        context: input.recording.description,
        transcript
      })
    : ''
  const actionItems = transcript
    ? await generateMeetingActionItemsFromTranscript({
        title: input.recording.title,
        transcript
      })
    : 'No action items identified.'

  const recording = await queryOne<OfficeRecordingRow>(
    `UPDATE office_recordings
     SET transcript = $3,
         summary = $4,
         status = 'ready',
         updated_at = now()
     WHERE id = $1
       AND office_id = $2
     RETURNING *`,
    [
      input.recording.id,
      input.officeId,
      transcript,
      summary
    ]
  )

  if (!recording) {
    throw new Error('Could not update recording transcript')
  }

  let transcriptArtifact: OfficeMeetingArtifactRow | null = null
  let summaryArtifact: OfficeMeetingArtifactRow | null = null
  let actionItemsArtifact: OfficeMeetingArtifactRow | null = null

  if (recording.meeting_session_id) {
    await ensureOfficeMeetingArtifactsTables()
    const metadata = {
      source: 'office_recording_transcription',
      recording_id: recording.id,
      recording_title: recording.title,
      generated_by: 'groq_whisper'
    }

    transcriptArtifact = await insertArtifact({
      meetingId: recording.meeting_session_id,
      artifactType: 'transcript',
      title: `${recording.title} transcript`,
      content: transcript,
      metadata,
      actorId: input.actorId
    })
    summaryArtifact = await insertArtifact({
      meetingId: recording.meeting_session_id,
      artifactType: 'summary',
      title: `${recording.title} summary`,
      content: summary,
      metadata,
      actorId: input.actorId
    })
    actionItemsArtifact = await insertArtifact({
      meetingId: recording.meeting_session_id,
      artifactType: 'action_items',
      title: `${recording.title} action items`,
      content: actionItems,
      metadata,
      actorId: input.actorId
    })

    if (actionItemsArtifact) {
      await createMeetingActionItemsFromArtifact({
        officeId: input.officeId,
        artifact: actionItemsArtifact,
        actorId: input.actorId
      })
    }

    await writeMeetingThreadEvent({
      officeId: input.officeId,
      meetingId: recording.meeting_session_id,
      recording,
      actorId: input.actorId,
      transcriptArtifactId: transcriptArtifact?.id,
      summaryArtifactId: summaryArtifact?.id,
      actionItemsArtifactId: actionItemsArtifact?.id
    })
  }

  await writeRecordingThreadEvent({
    officeId: input.officeId,
    recording,
    actorId: input.actorId,
    transcriptArtifactId: transcriptArtifact?.id,
    summaryArtifactId: summaryArtifact?.id,
    actionItemsArtifactId: actionItemsArtifact?.id
  })

  return {
    recording,
    transcript,
    summary,
    actionItems,
    artifacts: {
      transcript: transcriptArtifact,
      summary: summaryArtifact,
      actionItems: actionItemsArtifact
    }
  }
}
