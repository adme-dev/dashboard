import { createNotification } from '~~/server/utils/notifications'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeAssistantTables } from '~~/server/utils/officeAssistant'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficeMeetingThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeAssistantJobRow } from '~~/app/types/office'

type AssistantJobCandidate = OfficeAssistantJobRow & {
  input: Record<string, unknown> | string
  result: Record<string, unknown> | string
}

export interface ProcessOfficeAssistantJobsOptions {
  officeId: string
  jobId?: string
  limit?: number
}

export interface ProcessOfficeAssistantJobsResult {
  processed: OfficeAssistantJobRow[]
  failed: Array<{ id: string, error: string }>
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function checklistItems(content: string) {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.replace(/^- /, '').trim())
    .filter(Boolean)
}

function createFollowUpDraft(input: Record<string, unknown>) {
  const meetingTitle = typeof input.meeting_title === 'string' && input.meeting_title.trim()
    ? input.meeting_title.trim()
    : 'Office meeting'
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  const recipients = stringArray(input.guest_emails)
  const participantHandles = stringArray(input.participant_handles)
  const room = typeof input.room === 'string' && input.room.trim() ? input.room.trim() : ''
  const meetingStatus = typeof input.meeting_status === 'string' && input.meeting_status.trim()
    ? input.meeting_status.trim().replaceAll('_', ' ')
    : ''
  const items = checklistItems(content)
  const actionBlock = items.length
    ? [
        'Next steps:',
        ...items.map(item => `- ${item}`)
      ].join('\n')
    : content || 'The meeting action items are ready for review.'
  const contextLine = [
    room ? `Room: ${room}` : '',
    meetingStatus ? `Status: ${meetingStatus}` : ''
  ].filter(Boolean).join(' · ')

  return {
    mode: 'draft_follow_up',
    subject: `Follow-up: ${meetingTitle}`,
    recipients,
    body: [
      `Thanks for joining ${meetingTitle}.`,
      contextLine,
      '',
      actionBlock,
      '',
      'Please reply with any corrections or missing actions.'
    ].filter((line, index, all) => line || all[index - 1]).join('\n'),
    source: {
      type: input.source ?? 'assistant_job',
      meetingId: input.meeting_id ?? null,
      meetingTitle,
      artifactId: input.artifact_id ?? null,
      artifactType: input.artifact_type ?? null,
      actionItemId: input.action_item_id ?? null,
      room: room || null,
      status: meetingStatus || null
    },
    participantHandles
  }
}

function executeJob(job: AssistantJobCandidate) {
  const input = parseJsonRecord(job.input)
  if (job.job_type === 'send_follow_up') {
    return createFollowUpDraft(input)
  }

  return {
    mode: 'recorded_action',
    message: `${job.job_type.replaceAll('_', ' ')} is ready for operator review.`,
    input
  }
}

function sourceMeetingId(input: Record<string, unknown>) {
  if (
    (input.source === 'meeting_artifact' || input.source === 'meeting_action_item')
    && typeof input.meeting_id === 'string'
  ) {
    return input.meeting_id
  }
  return null
}

async function writeAssistantJobThreadEvent(options: {
  officeId: string
  job: OfficeAssistantJobRow
  input: Record<string, unknown>
  status: 'completed' | 'failed'
  error?: string
}) {
  const meetingId = sourceMeetingId(options.input)
  if (!meetingId || !options.job.user_id) return

  try {
    const channel = await ensureOfficeMeetingThreadChannel({
      officeId: options.officeId,
      meetingId,
      actorId: options.job.user_id
    })
    if (!channel) return

    await queryOne(
      `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        channel.id,
        options.job.user_id,
        options.status === 'completed'
          ? `Assistant follow-up draft ready: ${options.job.title}`
          : `Assistant follow-up failed: ${options.job.title}`,
        JSON.stringify({
          source: 'office_assistant_job',
          event: options.status === 'completed' ? 'follow_up_draft_ready' : 'follow_up_failed',
          job_id: options.job.id,
          job_type: options.job.job_type,
          meeting_id: meetingId,
          artifact_id: typeof options.input.artifact_id === 'string' ? options.input.artifact_id : null,
          action_item_id: typeof options.input.action_item_id === 'string' ? options.input.action_item_id : null,
          error: options.error ?? null
        })
      ]
    )
  } catch (error) {
    console.warn('[office-assistant-jobs] could not write meeting thread event:', error)
  }
}

export async function processOfficeAssistantJobs(
  options: ProcessOfficeAssistantJobsOptions
): Promise<ProcessOfficeAssistantJobsResult> {
  await ensureOfficeAssistantTables()
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50)
  const jobs = await queryRows<AssistantJobCandidate>(
    `SELECT *
     FROM office_assistant_jobs
     WHERE office_id = $1
       AND status = 'queued'
       ${options.jobId ? 'AND id = $2' : ''}
     ORDER BY created_at ASC
     LIMIT $${options.jobId ? 3 : 2}`,
    options.jobId ? [options.officeId, options.jobId, limit] : [options.officeId, limit]
  )

  const processed: OfficeAssistantJobRow[] = []
  const failed: Array<{ id: string, error: string }> = []

  for (const candidate of jobs) {
    const running = await queryOne<AssistantJobCandidate>(
      `UPDATE office_assistant_jobs
       SET status = 'running',
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
         AND office_id = $2
         AND status = 'queued'
       RETURNING *`,
      [candidate.id, options.officeId]
    )
    if (!running) continue

    try {
      const result = executeJob(running)
      const completed = await queryOne<OfficeAssistantJobRow>(
        `UPDATE office_assistant_jobs
         SET status = 'completed',
             result = $3,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND office_id = $2
         RETURNING *`,
        [running.id, options.officeId, JSON.stringify(result)]
      )
      if (!completed) continue

      const input = parseJsonRecord(running.input)
      if (
        input.source === 'meeting_artifact'
        && typeof input.meeting_id === 'string'
        && typeof input.artifact_id === 'string'
      ) {
        await ensureOfficeMeetingArtifactsTables()
        await queryOne(
          `UPDATE office_meeting_artifacts oma
           SET metadata = COALESCE(oma.metadata, '{}'::jsonb) || jsonb_build_object('follow_up_job', $4::jsonb)
           FROM office_meeting_sessions oms
           WHERE oma.id = $1
             AND oma.meeting_session_id = $2
             AND oms.id = oma.meeting_session_id
             AND oms.office_id = $3
           RETURNING oma.id`,
          [
            input.artifact_id,
            input.meeting_id,
            options.officeId,
            JSON.stringify({
              status: completed.status,
              job_id: completed.id,
              completed_at: completed.completed_at ?? new Date().toISOString()
            })
          ]
        )
      }
      if (
        input.source === 'meeting_action_item'
        && typeof input.meeting_id === 'string'
        && typeof input.action_item_id === 'string'
      ) {
        await ensureOfficeMeetingArtifactsTables()
        await queryOne(
          `UPDATE office_meeting_action_items omai
           SET metadata = COALESCE(omai.metadata, '{}'::jsonb) || jsonb_build_object('follow_up_job', $4::jsonb),
               updated_at = NOW()
           FROM office_meeting_sessions oms
           WHERE omai.id = $1
             AND omai.meeting_session_id = $2
             AND oms.id = omai.meeting_session_id
             AND oms.office_id = $3
           RETURNING omai.id`,
          [
            input.action_item_id,
            input.meeting_id,
            options.officeId,
            JSON.stringify({
              status: completed.status,
              job_id: completed.id,
              completed_at: completed.completed_at ?? new Date().toISOString()
            })
          ]
        )
      }
      await writeAssistantJobThreadEvent({
        officeId: options.officeId,
        job: completed,
        input,
        status: 'completed'
      })

      if (completed.user_id) {
        await createNotification({
          userId: completed.user_id,
          type: 'system',
          title: completed.job_type === 'send_follow_up' ? 'Follow-up draft ready' : 'Assistant job completed',
          message: completed.title,
          link: '/office',
          metadata: {
            jobId: completed.id,
            jobType: completed.job_type,
            result
          },
          reason: 'direct'
        })
      }
      processed.push(completed)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'execution_failed'
      failed.push({ id: running.id, error: message })
      const input = parseJsonRecord(running.input)
      await queryOne(
        `UPDATE office_assistant_jobs
         SET status = 'failed',
             result = $3,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND office_id = $2
         RETURNING id`,
        [running.id, options.officeId, JSON.stringify({ error: message })]
      )

      if (
        input.source === 'meeting_artifact'
        && typeof input.meeting_id === 'string'
        && typeof input.artifact_id === 'string'
      ) {
        await ensureOfficeMeetingArtifactsTables()
        await queryOne(
          `UPDATE office_meeting_artifacts oma
           SET metadata = COALESCE(oma.metadata, '{}'::jsonb) || jsonb_build_object('follow_up_job', $4::jsonb)
           FROM office_meeting_sessions oms
           WHERE oma.id = $1
             AND oma.meeting_session_id = $2
             AND oms.id = oma.meeting_session_id
             AND oms.office_id = $3
           RETURNING oma.id`,
          [
            input.artifact_id,
            input.meeting_id,
            options.officeId,
            JSON.stringify({
              status: 'failed',
              job_id: running.id,
              error: message,
              completed_at: new Date().toISOString()
            })
          ]
        )
      }
      if (
        input.source === 'meeting_action_item'
        && typeof input.meeting_id === 'string'
        && typeof input.action_item_id === 'string'
      ) {
        await ensureOfficeMeetingArtifactsTables()
        await queryOne(
          `UPDATE office_meeting_action_items omai
           SET metadata = COALESCE(omai.metadata, '{}'::jsonb) || jsonb_build_object('follow_up_job', $4::jsonb),
               updated_at = NOW()
           FROM office_meeting_sessions oms
           WHERE omai.id = $1
             AND omai.meeting_session_id = $2
             AND oms.id = omai.meeting_session_id
             AND oms.office_id = $3
           RETURNING omai.id`,
          [
            input.action_item_id,
            input.meeting_id,
            options.officeId,
            JSON.stringify({
              status: 'failed',
              job_id: running.id,
              error: message,
              completed_at: new Date().toISOString()
            })
          ]
        )
      }
      await writeAssistantJobThreadEvent({
        officeId: options.officeId,
        job: running,
        input,
        status: 'failed',
        error: message
      })
    }
  }

  return { processed, failed }
}
