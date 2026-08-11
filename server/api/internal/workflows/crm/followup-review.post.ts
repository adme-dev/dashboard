import { defineEventHandler, getHeader, readBody, createError, type H3Event } from 'h3'
import { queryRows } from '~~/server/utils/db'
import {
  authorizeTrustedReminderTasks,
  claimTrustedReminderTasks,
  partitionReminders,
  type ReminderTask
} from '~~/server/utils/crm/activation'
import { recordFieldChanges } from '~~/server/utils/crm/audit'
import { createNotification } from '~~/server/utils/notifications'
import {
  CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND,
  normalizeCrmFollowupReviewWorkflowPayload
} from '~~/server/utils/agencyWorkflows/crmFollowupReview'

/**
 * POST /api/internal/workflows/crm/followup-review
 *
 * Durable CRM follow-up callback for the agency-workflows Worker.
 * It reports due reminder pressure through the existing anti-flood partitioning
 * logic by default. Notification/reminded_at writes are opt-in via
 * AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED.
 */
export default defineEventHandler(async (event) => {
  requireWorkflowCallbackSecret(event)

  if (process.env.AGENCY_WORKFLOWS_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Agency workflows are disabled' })
  }

  const payload = await readWorkflowPayload(event)
  const reviewCutoff = reviewCutoffFromBucket(payload.bucket)
  const candidates = await queryRows<ReminderTask>(
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
  const tasks = await authorizeTrustedReminderTasks(candidates, 'crm_followup_review')
  const { toNotify, toDrain } = partitionReminders(tasks, reviewCutoff)
  const writesEnabled = process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED === 'true'
  const writeSummary = writesEnabled
    ? await processReminderWrites({ bucket: payload.bucket, tasksToNotify: toNotify, tasksToDrain: toDrain, reviewCutoff })
    : emptyWriteSummary('review')
  const summary = {
    ...summarizeReminderPressure(tasks, toNotify.length, toDrain.length, reviewCutoff),
    ...writeSummary
  }

  console.info('agency-workflows.crm-followup.review.completed', {
    bucket: payload.bucket,
    scope: payload.scope,
    clientId: payload.clientId,
    mode: summary.mode,
    considered: summary.considered,
    notifyCandidateCount: summary.notifyCandidateCount,
    drainCandidateCount: summary.drainCandidateCount,
    overdueCount: summary.overdueCount,
    notifiedCount: summary.notifiedCount,
    notificationFailureCount: summary.notificationFailureCount,
    markedRemindedCount: summary.markedRemindedCount,
    auditFailureCount: summary.auditFailureCount
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

interface ProcessReminderWritesInput {
  bucket: string
  tasksToNotify: ReminderTask[]
  tasksToDrain: ReminderTask[]
  reviewCutoff: Date
}

function emptyWriteSummary(mode: 'review' | 'write') {
  return {
    mode,
    notifiedCount: 0,
    notificationFailureCount: 0,
    drainedCount: 0,
    markedRemindedCount: 0,
    skippedAlreadyProcessedCount: 0,
    auditFailureCount: 0
  }
}

async function processReminderWrites(input: ProcessReminderWritesInput) {
  const candidates = [...input.tasksToNotify, ...input.tasksToDrain]
  if (!candidates.length) return emptyWriteSummary('write')

  const candidateIds = candidates.map(task => task.id)
  const remindedAt = input.reviewCutoff.toISOString()
  const claimed = await claimTrustedReminderTasks({
    tasks: candidates,
    remindedAt: input.reviewCutoff,
    purpose: 'crm_followup_review'
  })
  const claimedIds = new Set(claimed.map(row => row.id))
  const notifyTasks = input.tasksToNotify.filter(task => claimedIds.has(task.id))
  const drainedTasks = input.tasksToDrain.filter(task => claimedIds.has(task.id))

  let notifiedCount = 0
  let notificationFailureCount = 0
  for (const task of notifyTasks) {
    const overdue = task.due_at ? new Date(task.due_at).getTime() < input.reviewCutoff.getTime() : false
    try {
      await createNotification({
        userId: task.assigned_to!,
        type: overdue ? 'task_overdue' : 'task_due_soon',
        title: overdue ? 'CRM task overdue' : 'CRM task reminder',
        message: overdue ? `"${task.title}" is overdue` : `Reminder: "${task.title}"`,
        link: '/agency/crm',
        metadata: {
          crmTaskId: task.id,
          clientId: task.client_id,
          workflow: CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND,
          bucket: input.bucket
        },
        reason: 'assigned'
      })
      notifiedCount++
    } catch (error) {
      notificationFailureCount++
      console.warn('agency-workflows.crm-followup.review.notification.failed', {
        taskId: task.id,
        clientId: task.client_id,
        bucket: input.bucket,
        error: safeError(error)
      })
    }
  }

  let auditFailureCount = 0
  for (const row of claimed) {
    try {
      await recordFieldChanges({
        clientId: row.client_id,
        entityType: 'task',
        entityId: row.id,
        before: { reminded_at: null },
        after: { reminded_at: remindedAt },
        fields: ['reminded_at'],
        actor: null
      })
    } catch (error) {
      auditFailureCount++
      console.warn('agency-workflows.crm-followup.review.audit.failed', {
        taskId: row.id,
        clientId: row.client_id,
        bucket: input.bucket,
        error: safeError(error)
      })
    }
  }

  return {
    mode: 'write' as const,
    notifiedCount,
    notificationFailureCount,
    drainedCount: drainedTasks.length,
    markedRemindedCount: claimed.length,
    skippedAlreadyProcessedCount: candidateIds.length - claimed.length,
    auditFailureCount
  }
}

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

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
