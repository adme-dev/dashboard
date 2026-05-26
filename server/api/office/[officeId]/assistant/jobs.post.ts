/**
 * POST /api/office/:officeId/assistant/jobs
 * Create a visible assistant execution job.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeAssistantTables } from '~~/server/utils/officeAssistant'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import type { OfficeAssistantJobRow, OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  watch_id: z.string().uuid().nullable().optional(),
  job_type: z.enum(['notify', 'schedule_meeting', 'send_follow_up', 'summarize_thread', 'collect_status']),
  title: z.string().trim().min(1).max(180),
  input: z.record(z.string(), z.unknown()).default({}),
  approval_required: z.boolean().default(false)
})

type ArtifactDeliveryRow = {
  artifact_type: string
  metadata: Record<string, unknown> | string | null
}

type ActionItemDeliveryRow = {
  status: string
  metadata: Record<string, unknown> | string | null
}

function parseRecord(value: unknown): Record<string, unknown> {
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

function followUpDeliveryStatus(metadata: unknown) {
  const delivery = parseRecord(parseRecord(metadata).follow_up_delivery)
  return typeof delivery.status === 'string' ? delivery.status : ''
}

function artifactMetadataStatus(metadata: unknown) {
  const status = parseRecord(metadata).status
  return typeof status === 'string' ? status : ''
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

  await ensureOfficeAssistantTables()
  const body = Body.parse(await readBody(event))
  let sourceMeetingArtifact: { meetingId: string, artifactId: string } | null = null
  let sourceMeetingActionItem: { meetingId: string, actionItemId: string } | null = null

  if (body.watch_id) {
    const watch = await queryOne<{ id: string }>(
      `SELECT id
       FROM office_assistant_watches
       WHERE id = $1
         AND office_id = $2`,
      [body.watch_id, officeId]
    )
    if (!watch) {
      throw createError({ statusCode: 404, statusMessage: 'Assistant watch not found' })
    }
  }

  if (
    body.job_type === 'send_follow_up'
    && body.input.source === 'meeting_artifact'
    && typeof body.input.meeting_id === 'string'
    && typeof body.input.artifact_id === 'string'
  ) {
    sourceMeetingArtifact = {
      meetingId: body.input.meeting_id,
      artifactId: body.input.artifact_id
    }
    await ensureOfficeMeetingArtifactsTables()
    const artifact = await queryOne<ArtifactDeliveryRow>(
      `SELECT oma.artifact_type, oma.metadata
       FROM office_meeting_artifacts oma
       JOIN office_meeting_sessions oms ON oms.id = oma.meeting_session_id
       WHERE oma.id = $1
         AND oma.meeting_session_id = $2
         AND oms.office_id = $3`,
      [body.input.artifact_id, body.input.meeting_id, officeId]
    )

    if (!artifact) {
      throw createError({ statusCode: 404, statusMessage: 'Source meeting artifact not found' })
    }
    if (artifact.artifact_type !== 'action_items') {
      throw createError({ statusCode: 409, statusMessage: 'Follow-ups can only be created from action item artifacts' })
    }
    if (followUpDeliveryStatus(artifact.metadata) === 'sent') {
      throw createError({ statusCode: 409, statusMessage: 'Follow-up has already been sent for this artifact' })
    }
    if (artifactMetadataStatus(artifact.metadata) === 'placeholder') {
      throw createError({ statusCode: 409, statusMessage: 'Add real action items before creating a follow-up' })
    }

    const existingJob = await queryOne<Pick<OfficeAssistantJobRow, 'id' | 'status'>>(
      `SELECT id, status
       FROM office_assistant_jobs
       WHERE office_id = $1
         AND job_type = 'send_follow_up'
         AND status NOT IN ('cancelled', 'failed')
         AND input->>'source' = 'meeting_artifact'
         AND input->>'meeting_id' = $2
         AND input->>'artifact_id' = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [officeId, body.input.meeting_id, body.input.artifact_id]
    )
    if (existingJob) {
      throw createError({ statusCode: 409, statusMessage: 'A follow-up job already exists for this artifact' })
    }
  }

  if (
    body.job_type === 'send_follow_up'
    && body.input.source === 'meeting_action_item'
    && typeof body.input.meeting_id === 'string'
    && typeof body.input.action_item_id === 'string'
  ) {
    sourceMeetingActionItem = {
      meetingId: body.input.meeting_id,
      actionItemId: body.input.action_item_id
    }
    await ensureOfficeMeetingArtifactsTables()
    const actionItem = await queryOne<ActionItemDeliveryRow>(
      `SELECT omai.status, omai.metadata
       FROM office_meeting_action_items omai
       JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
       WHERE omai.id = $1
         AND omai.meeting_session_id = $2
         AND oms.office_id = $3`,
      [body.input.action_item_id, body.input.meeting_id, officeId]
    )

    if (!actionItem) {
      throw createError({ statusCode: 404, statusMessage: 'Source meeting action item not found' })
    }
    if (actionItem.status === 'done' || actionItem.status === 'dismissed') {
      throw createError({ statusCode: 409, statusMessage: 'Only active action items can be sent to the assistant' })
    }

    const existingJob = await queryOne<Pick<OfficeAssistantJobRow, 'id' | 'status'>>(
      `SELECT id, status
       FROM office_assistant_jobs
       WHERE office_id = $1
         AND job_type = 'send_follow_up'
         AND status NOT IN ('cancelled', 'failed')
         AND input->>'source' = 'meeting_action_item'
         AND input->>'meeting_id' = $2
         AND input->>'action_item_id' = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [officeId, body.input.meeting_id, body.input.action_item_id]
    )
    if (existingJob) {
      throw createError({ statusCode: 409, statusMessage: 'A follow-up job already exists for this action item' })
    }
  }

  const job = await queryOne<OfficeAssistantJobRow>(
    `INSERT INTO office_assistant_jobs (
       office_id, watch_id, user_id, job_type, status, title, input, approval_required
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      officeId,
      body.watch_id ?? null,
      user.id,
      body.job_type,
      body.approval_required ? 'waiting_approval' : 'queued',
      body.title,
      JSON.stringify(body.input),
      body.approval_required
    ]
  )

  if (!job) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create assistant job' })
  }

  if (sourceMeetingArtifact) {
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
        sourceMeetingArtifact.artifactId,
        sourceMeetingArtifact.meetingId,
        officeId,
        JSON.stringify({
          status: job.status,
          job_id: job.id,
          created_at: job.created_at ?? new Date().toISOString()
        })
      ]
    )
  }

  if (sourceMeetingActionItem) {
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
        sourceMeetingActionItem.actionItemId,
        sourceMeetingActionItem.meetingId,
        officeId,
        JSON.stringify({
          status: job.status,
          job_id: job.id,
          created_at: job.created_at ?? new Date().toISOString()
        })
      ]
    )
  }

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'assistant_job.created',
    targetType: 'office_assistant_job',
    targetId: job.id,
    metadata: {
      jobType: job.job_type,
      approvalRequired: job.approval_required
    }
  })

  return { job }
})
