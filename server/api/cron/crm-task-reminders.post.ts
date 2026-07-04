// server/api/cron/crm-task-reminders.post.ts
// P4.1 F1b — fire reminders for due CRM tasks. Triggered by the workers/crm-cron
// companion Worker (Nitro Pages has no scheduled() handler). Idempotent via
// crm_tasks.reminded_at; anti-flood via partitionReminders (long-overdue backlog
// is marked reminded without notifying — see activation.ts).
//
// Auth: x-cron-secret matched against CRON_SECRET (skipped in dev).
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { partitionReminders, type ReminderTask } from '~~/server/utils/crm/activation'
import { startCrmFollowupReviewWorkflow } from '~~/server/utils/agencyWorkflows/client'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY === 'true') {
    if (process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED !== 'true') {
      throw createError({
        statusCode: 503,
        statusMessage: 'CRM follow-up Workflow primary requires AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED=true'
      })
    }

    const bucket = previousCompletedHourBucket()
    const result = await startCrmFollowupReviewWorkflow(event, {
      bucket,
      scope: 'all',
      trigger: 'cron'
    })
    if (!result.ok) {
      throw createError({
        statusCode: 503,
        statusMessage: `CRM follow-up Workflow delegation failed: ${result.reason}`
      })
    }

    const delegated = {
      ok: true,
      delegated: true,
      workflow: 'crm.followup.review',
      bucket,
      result
    }
    console.log('[crm-cron] task-reminders delegated', {
      workflow: delegated.workflow,
      bucket,
      instanceId: result.instanceId
    })
    return delegated
  }

  const now = new Date()
  const tasks = await queryRows<ReminderTask>(
    `SELECT id, client_id, title, assigned_to,
            reminder_at::text AS reminder_at, due_at::text AS due_at
       FROM crm_tasks
      WHERE deleted_at IS NULL
        AND status IN ('pending','in_progress')
        AND reminder_at IS NOT NULL
        AND reminded_at IS NULL
        AND reminder_at <= NOW()
      ORDER BY reminder_at ASC
      LIMIT 500`
  )

  const { toNotify, toDrain } = partitionReminders(tasks, now)

  let notified = 0
  for (const t of toNotify) {
    const overdue = t.due_at ? new Date(t.due_at).getTime() < now.getTime() : false
    try {
      await createNotification({
        userId: t.assigned_to!,
        type: overdue ? 'task_overdue' : 'task_due_soon',
        title: overdue ? 'CRM task overdue' : 'CRM task reminder',
        message: overdue ? `"${t.title}" is overdue` : `Reminder: "${t.title}"`,
        link: '/agency/crm',
        metadata: { crmTaskId: t.id, clientId: t.client_id },
        reason: 'assigned'
      })
      notified++
    } catch (e) {
      console.error('[crm-cron] reminder notify failed', t.id, e)
    }
  }

  // Mark everything we processed (notified + drained) as reminded so it never
  // re-fires. The drain count is reported, never silently dropped.
  const ids = [...toNotify, ...toDrain].map(t => t.id)
  if (ids.length) {
    await execute(`UPDATE crm_tasks SET reminded_at = NOW() WHERE id = ANY($1::uuid[])`, [ids])
  }

  const result = { ok: true, considered: tasks.length, notified, drained: toDrain.length }
  console.log('[crm-cron] task-reminders', result)
  return result
})

function previousCompletedHourBucket(now = new Date()): string {
  const currentHourStart = Math.floor(now.getTime() / 3600000) * 3600000
  return new Date(currentHourStart - 3600000).toISOString().slice(0, 13)
}
