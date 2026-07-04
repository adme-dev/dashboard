import { defineEventHandler, getHeader, readBody, createError, type H3Event } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { partitionReminders, type ReminderTask } from '~~/server/utils/crm/activation'
import {
  CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND,
  normalizeCrmFollowupReviewWorkflowPayload
} from '~~/server/utils/agencyWorkflows/crmFollowupReview'

/**
 * POST /api/internal/workflows/crm/followup-review
 *
 * Durable read-only CRM follow-up callback for the agency-workflows Worker.
 * It reports due reminder pressure through the existing anti-flood partitioning
 * logic. It does not create notifications or mark crm_tasks.reminded_at.
 */
export default defineEventHandler(async (event) => {
  requireWorkflowCallbackSecret(event)

  if (process.env.AGENCY_WORKFLOWS_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Agency workflows are disabled' })
  }

  const payload = await readWorkflowPayload(event)
  const reviewCutoff = reviewCutoffFromBucket(payload.bucket)
  const tasks = await queryRows<ReminderTask>(
    `SELECT id::text AS id, client_id::text AS client_id, title, assigned_to::text AS assigned_to,
            reminder_at::text AS reminder_at, due_at::text AS due_at
       FROM crm_tasks
      WHERE deleted_at IS NULL
        AND status IN ('pending','in_progress')
        AND reminder_at IS NOT NULL
        AND reminded_at IS NULL
        AND reminder_at < $1::timestamptz
        ${payload.scope === 'client' ? 'AND client_id = $2' : ''}
      ORDER BY reminder_at ASC
      LIMIT 500`,
    payload.scope === 'client' ? [reviewCutoff.toISOString(), payload.clientId as string] : [reviewCutoff.toISOString()]
  )
  const { toNotify, toDrain } = partitionReminders(tasks, reviewCutoff)
  const summary = summarizeReminderPressure(tasks, toNotify.length, toDrain.length, reviewCutoff)

  console.info('agency-workflows.crm-followup.review.completed', {
    bucket: payload.bucket,
    scope: payload.scope,
    clientId: payload.clientId,
    considered: summary.considered,
    notifyCandidateCount: summary.notifyCandidateCount,
    drainCandidateCount: summary.drainCandidateCount,
    overdueCount: summary.overdueCount
  })

  return {
    ok: true,
    workflow: CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND,
    bucket: payload.bucket,
    scope: payload.scope,
    clientId: payload.clientId ?? null,
    result: {
      ok: true,
      ...summary
    }
  }
})

function summarizeReminderPressure(
  tasks: ReminderTask[],
  notifyCandidateCount: number,
  drainCandidateCount: number,
  now: Date
) {
  return {
    considered: tasks.length,
    notifyCandidateCount,
    drainCandidateCount,
    assignedCount: tasks.filter(task => Boolean(task.assigned_to)).length,
    unassignedCount: tasks.filter(task => !task.assigned_to).length,
    overdueCount: tasks.filter(task => task.due_at && new Date(task.due_at).getTime() < now.getTime()).length,
    oldestReminderAt: tasks[0]?.reminder_at ?? null,
    newestReminderAt: tasks.at(-1)?.reminder_at ?? null
  }
}

function reviewCutoffFromBucket(bucket: string): Date {
  const start = Date.parse(`${bucket}:00:00.000Z`)
  return new Date(start + 60 * 60 * 1000)
}

function requireWorkflowCallbackSecret(event: H3Event) {
  const expected = process.env.WORKFLOW_CALLBACK_SECRET?.trim() || process.env.WORKFLOW_SERVICE_SECRET?.trim()
  if (!expected) {
    throw createError({ statusCode: 503, statusMessage: 'WORKFLOW_CALLBACK_SECRET is not configured' })
  }
  if (getHeader(event, 'x-workflow-secret') !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

async function readWorkflowPayload(event: H3Event) {
  try {
    return normalizeCrmFollowupReviewWorkflowPayload(await readBody(event))
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid workflow payload'
    })
  }
}
