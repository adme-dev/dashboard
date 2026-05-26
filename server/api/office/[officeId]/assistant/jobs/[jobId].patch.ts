/**
 * PATCH /api/office/:officeId/assistant/jobs/:jobId
 * Approve or cancel an assistant execution job.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { isEmailConfigured, sendOfficeFollowUpEmail } from '~~/server/utils/email'
import { ensureOfficeAssistantTables } from '~~/server/utils/officeAssistant'
import { processOfficeAssistantJobs } from '~~/server/utils/officeAssistantJobs'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficeMeetingThreadChannel } from '~~/server/utils/officeThreads'
import { canAdministerOffice } from '~~/server/utils/officeRoom'
import type { OfficeAssistantJobRow, OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  action: z.enum(['approve', 'cancel', 'send', 'update_draft']),
  recipients: z.array(z.string().email()).min(1).optional(),
  subject: z.string().trim().min(1).max(180).optional(),
  body: z.string().trim().min(1).max(200_000).optional()
}).refine(
  body => body.action !== 'update_draft' || Boolean(body.recipients || body.subject || body.body),
  {
    message: 'At least one draft field is required',
    path: ['action']
  }
)

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseResult(value: unknown): Record<string, unknown> {
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

async function validateMeetingFollowUpRecipients(options: {
  officeId: string
  meetingId: string | null
  recipients: string[]
}) {
  if (!options.meetingId) return
  await ensureOfficeMeetingArtifactsTables()
  const meeting = await queryOne<{ guest_emails: string[] | null }>(
    `SELECT guest_emails
     FROM office_meeting_sessions
     WHERE id = $1
       AND office_id = $2`,
    [options.meetingId, options.officeId]
  )
  if (!meeting) {
    throw createError({ statusCode: 404, statusMessage: 'Source meeting not found' })
  }
  const allowedRecipients = new Set(
    (meeting.guest_emails ?? [])
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  )
  const unknownRecipients = options.recipients.filter(recipient => !allowedRecipients.has(recipient.trim().toLowerCase()))
  if (unknownRecipients.length) {
    throw createError({ statusCode: 400, statusMessage: 'Follow-up recipients must belong to the source meeting guest list' })
  }
}

async function updateMeetingActionItemFollowUpMetadata(options: {
  officeId: string
  meetingId: string | null
  actionItemId: string | null
  key: 'follow_up_job' | 'follow_up_delivery'
  metadata: Record<string, unknown>
}) {
  if (!options.meetingId || !options.actionItemId) return

  await ensureOfficeMeetingArtifactsTables()
  await queryOne(
    `UPDATE office_meeting_action_items omai
     SET metadata = COALESCE(omai.metadata, '{}'::jsonb) || jsonb_build_object($4, $5::jsonb),
         updated_at = NOW()
     FROM office_meeting_sessions oms
     WHERE omai.id = $1
       AND omai.meeting_session_id = $2
       AND oms.id = omai.meeting_session_id
       AND oms.office_id = $3
     RETURNING omai.id`,
    [
      options.actionItemId,
      options.meetingId,
      options.officeId,
      options.key,
      JSON.stringify(options.metadata)
    ]
  )
}

async function writeFollowUpSentThreadEvent(options: {
  officeId: string
  meetingId: string | null
  actorId: string
  jobId: string
  subject: string
  recipients: string[]
  artifactId: string | null
  actionItemId: string | null
}) {
  if (!options.meetingId) return

  try {
    const channel = await ensureOfficeMeetingThreadChannel({
      officeId: options.officeId,
      meetingId: options.meetingId,
      actorId: options.actorId
    })
    if (!channel) return

    await queryOne(
      `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        channel.id,
        options.actorId,
        `Follow-up sent: ${options.subject}`,
        JSON.stringify({
          source: 'office_assistant_job',
          event: 'follow_up_sent',
          job_id: options.jobId,
          meeting_id: options.meetingId,
          artifact_id: options.artifactId,
          action_item_id: options.actionItemId,
          recipients: options.recipients
        })
      ]
    )
  } catch (error) {
    console.warn('[office-assistant-job] could not write follow-up sent thread event:', error)
  }
}

async function writeFollowUpDraftUpdatedThreadEvent(options: {
  officeId: string
  meetingId: string | null
  actorId: string
  jobId: string
  subject: unknown
  artifactId: string | null
  actionItemId: string | null
}) {
  if (!options.meetingId) return

  try {
    const channel = await ensureOfficeMeetingThreadChannel({
      officeId: options.officeId,
      meetingId: options.meetingId,
      actorId: options.actorId
    })
    if (!channel) return

    const subject = typeof options.subject === 'string' && options.subject.trim()
      ? options.subject.trim()
      : 'Follow-up draft'

    await queryOne(
      `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        channel.id,
        options.actorId,
        `Follow-up draft updated: ${subject}`,
        JSON.stringify({
          source: 'office_assistant_job',
          event: 'follow_up_draft_updated',
          job_id: options.jobId,
          meeting_id: options.meetingId,
          artifact_id: options.artifactId,
          action_item_id: options.actionItemId
        })
      ]
    )
  } catch (error) {
    console.warn('[office-assistant-job] could not write follow-up draft thread event:', error)
  }
}

async function writeFollowUpCancelledThreadEvent(options: {
  officeId: string
  meetingId: string | null
  actorId: string
  jobId: string
  title: string
  artifactId: string | null
  actionItemId: string | null
}) {
  if (!options.meetingId) return

  try {
    const channel = await ensureOfficeMeetingThreadChannel({
      officeId: options.officeId,
      meetingId: options.meetingId,
      actorId: options.actorId
    })
    if (!channel) return

    await queryOne(
      `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        channel.id,
        options.actorId,
        `Follow-up cancelled: ${options.title}`,
        JSON.stringify({
          source: 'office_assistant_job',
          event: 'follow_up_cancelled',
          job_id: options.jobId,
          meeting_id: options.meetingId,
          artifact_id: options.artifactId,
          action_item_id: options.actionItemId
        })
      ]
    )
  } catch (error) {
    console.warn('[office-assistant-job] could not write follow-up cancellation thread event:', error)
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const jobId = getRouterParam(event, 'jobId')

  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: 'jobId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeAssistantTables()
  const job = await queryOne<OfficeAssistantJobRow>(
    `SELECT * FROM office_assistant_jobs WHERE id = $1 AND office_id = $2`,
    [jobId, officeId]
  )
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Assistant job not found' })
  }

  const body = Body.parse(await readBody(event))
  const canManageJob = canAdministerOffice(user, membership) || job.user_id === user.id
  if (!canManageJob) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot manage this assistant job' })
  }

  if (body.action === 'approve' && job.status !== 'waiting_approval') {
    throw createError({ statusCode: 409, statusMessage: 'Assistant job is not waiting for approval' })
  }
  if (body.action === 'cancel' && ['completed', 'cancelled'].includes(job.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Assistant job is already closed' })
  }
  if (body.action === 'send') {
    if (job.job_type !== 'send_follow_up' || job.status !== 'completed') {
      throw createError({ statusCode: 409, statusMessage: 'Assistant job is not a completed follow-up draft' })
    }

    const result = parseResult(job.result)
    const existingDelivery = parseResult(result.delivery)
    if (existingDelivery.status === 'sent') {
      throw createError({ statusCode: 409, statusMessage: 'Follow-up has already been sent' })
    }

    const recipients = stringArray(result.recipients)
    const subject = typeof result.subject === 'string' ? result.subject : job.title
    const body = typeof result.body === 'string' ? result.body : ''
    const source = parseResult(result.source)
    const meetingTitle = typeof source.meetingTitle === 'string'
      ? source.meetingTitle
      : subject.replace(/^Follow-up:\s*/i, '') || 'Office meeting'

    if (!recipients.length || !body.trim()) {
      throw createError({ statusCode: 409, statusMessage: 'Follow-up draft has no recipients or body' })
    }
    if (!isEmailConfigured(event)) {
      throw createError({ statusCode: 503, statusMessage: 'Email delivery is not configured' })
    }

    const deliveredResult = {
      ...result,
      delivery: {
        status: 'sent',
        sent_at: new Date().toISOString(),
        recipients
      }
    }
    const sourceMeetingId = typeof source.meetingId === 'string' ? source.meetingId : null
    const sourceArtifactId = typeof source.artifactId === 'string' ? source.artifactId : null
    const sourceActionItemId = typeof source.actionItemId === 'string' ? source.actionItemId : null

    await validateMeetingFollowUpRecipients({ officeId, meetingId: sourceMeetingId, recipients })

    await Promise.all(recipients.map(recipient => sendOfficeFollowUpEmail({
      to: recipient,
      subject,
      body,
      meetingTitle
    }, event)))

    const sent = await queryOne<OfficeAssistantJobRow>(
      `UPDATE office_assistant_jobs
       SET result = $3,
           updated_at = NOW()
       WHERE id = $1 AND office_id = $2
       RETURNING *`,
      [jobId, officeId, JSON.stringify(deliveredResult)]
    )
    if (!sent) {
      throw createError({ statusCode: 500, statusMessage: 'Could not mark follow-up as sent' })
    }

    if (sourceMeetingId && sourceArtifactId) {
      await queryOne(
        `UPDATE office_meeting_artifacts oma
         SET metadata = COALESCE(oma.metadata, '{}'::jsonb) || jsonb_build_object('follow_up_delivery', $4::jsonb)
         FROM office_meeting_sessions oms
         WHERE oma.id = $1
           AND oma.meeting_session_id = $2
           AND oms.id = oma.meeting_session_id
           AND oms.office_id = $3
         RETURNING oma.id`,
        [
          sourceArtifactId,
          sourceMeetingId,
          officeId,
          JSON.stringify({
            status: 'sent',
            sent_at: deliveredResult.delivery.sent_at,
            recipients,
            job_id: sent.id,
            edited_at: typeof result.edited_at === 'string' ? result.edited_at : null
          })
        ]
      )
    }
    await updateMeetingActionItemFollowUpMetadata({
      officeId,
      meetingId: sourceMeetingId,
      actionItemId: sourceActionItemId,
      key: 'follow_up_delivery',
      metadata: {
        status: 'sent',
        sent_at: deliveredResult.delivery.sent_at,
        recipients,
        job_id: sent.id,
        edited_at: typeof result.edited_at === 'string' ? result.edited_at : null
      }
    })
    await writeFollowUpSentThreadEvent({
      officeId,
      meetingId: sourceMeetingId,
      actorId: user.id,
      jobId: sent.id,
      subject,
      recipients,
      artifactId: sourceArtifactId,
      actionItemId: sourceActionItemId
    })

    await logOfficeAuditEvent({
      officeId,
      actorId: user.id,
      action: 'assistant_job.sent',
      targetType: 'office_assistant_job',
      targetId: sent.id,
      metadata: {
        jobType: sent.job_type,
        recipients
      }
    })

    return { job: sent }
  }

  if (body.action === 'update_draft') {
    if (job.job_type !== 'send_follow_up' || job.status !== 'completed') {
      throw createError({ statusCode: 409, statusMessage: 'Assistant job is not an editable follow-up draft' })
    }

    const result = parseResult(job.result)
    const existingDelivery = parseResult(result.delivery)
    if (existingDelivery.status === 'sent') {
      throw createError({ statusCode: 409, statusMessage: 'Sent follow-up drafts cannot be edited' })
    }

    const source = parseResult(result.source)
    const sourceMeetingId = typeof source.meetingId === 'string' ? source.meetingId : null
    const sourceArtifactId = typeof source.artifactId === 'string' ? source.artifactId : null
    const sourceActionItemId = typeof source.actionItemId === 'string' ? source.actionItemId : null
    const nextRecipients = body.recipients ?? stringArray(result.recipients)
    await validateMeetingFollowUpRecipients({ officeId, meetingId: sourceMeetingId, recipients: nextRecipients })

    const updatedResult = {
      ...result,
      recipients: nextRecipients,
      subject: body.subject ?? result.subject,
      body: body.body ?? result.body,
      edited_at: new Date().toISOString(),
      edited_by: user.id
    }
    const updatedDraft = await queryOne<OfficeAssistantJobRow>(
      `UPDATE office_assistant_jobs
       SET result = $3,
           updated_at = NOW()
       WHERE id = $1 AND office_id = $2
       RETURNING *`,
      [jobId, officeId, JSON.stringify(updatedResult)]
    )
    if (!updatedDraft) {
      throw createError({ statusCode: 500, statusMessage: 'Could not update follow-up draft' })
    }

    if (sourceMeetingId && sourceArtifactId) {
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
          sourceArtifactId,
          sourceMeetingId,
          officeId,
          JSON.stringify({
            status: updatedDraft.status,
            job_id: updatedDraft.id,
            edited_at: updatedResult.edited_at,
            updated_at: new Date().toISOString()
          })
        ]
      )
    }
    await updateMeetingActionItemFollowUpMetadata({
      officeId,
      meetingId: sourceMeetingId,
      actionItemId: sourceActionItemId,
      key: 'follow_up_job',
      metadata: {
        status: updatedDraft.status,
        job_id: updatedDraft.id,
        edited_at: updatedResult.edited_at,
        updated_at: new Date().toISOString()
      }
    })
    await writeFollowUpDraftUpdatedThreadEvent({
      officeId,
      meetingId: sourceMeetingId,
      actorId: user.id,
      jobId: updatedDraft.id,
      subject: updatedResult.subject,
      artifactId: sourceArtifactId,
      actionItemId: sourceActionItemId
    })

    await logOfficeAuditEvent({
      officeId,
      actorId: user.id,
      action: 'assistant_job.draft_updated',
      targetType: 'office_assistant_job',
      targetId: updatedDraft.id,
      metadata: { jobType: updatedDraft.job_type }
    })

    return { job: updatedDraft }
  }

  const updated = body.action === 'approve'
    ? await queryOne<OfficeAssistantJobRow>(
        `UPDATE office_assistant_jobs
         SET status = 'queued',
             approved_by = $3,
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND office_id = $2
         RETURNING *`,
        [jobId, officeId, user.id]
      )
    : await queryOne<OfficeAssistantJobRow>(
        `UPDATE office_assistant_jobs
         SET status = 'cancelled',
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
         WHERE id = $1 AND office_id = $2
         RETURNING *`,
        [jobId, officeId]
      )

  if (!updated) {
    throw createError({ statusCode: 500, statusMessage: 'Could not update assistant job' })
  }

  const jobInput = parseResult(job.input)
  const sourceMeetingId = typeof jobInput.meeting_id === 'string' ? jobInput.meeting_id : null
  const sourceArtifactId = typeof jobInput.artifact_id === 'string' ? jobInput.artifact_id : null
  const sourceActionItemId = typeof jobInput.action_item_id === 'string' ? jobInput.action_item_id : null
  if (sourceMeetingId && sourceArtifactId) {
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
        sourceArtifactId,
        sourceMeetingId,
        officeId,
        JSON.stringify({
          status: updated.status,
          job_id: updated.id,
          updated_at: new Date().toISOString()
        })
      ]
    )
  }
  await updateMeetingActionItemFollowUpMetadata({
    officeId,
    meetingId: sourceMeetingId,
    actionItemId: sourceActionItemId,
    key: 'follow_up_job',
    metadata: {
      status: updated.status,
      job_id: updated.id,
      updated_at: new Date().toISOString()
    }
  })
  if (body.action === 'cancel') {
    await writeFollowUpCancelledThreadEvent({
      officeId,
      meetingId: sourceMeetingId,
      actorId: user.id,
      jobId: updated.id,
      title: updated.title,
      artifactId: sourceArtifactId,
      actionItemId: sourceActionItemId
    })
  }

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: body.action === 'approve' ? 'assistant_job.approved' : 'assistant_job.cancelled',
    targetType: 'office_assistant_job',
    targetId: updated.id,
    metadata: {
      jobType: updated.job_type,
      previousStatus: job.status,
      status: updated.status
    }
  })

  if (body.action === 'approve') {
    const execution = await processOfficeAssistantJobs({
      officeId,
      jobId: updated.id,
      limit: 1
    })

    return {
      job: execution.processed[0] ?? updated,
      execution
    }
  }

  return { job: updated }
})
