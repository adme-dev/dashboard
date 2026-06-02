import { defineEventHandler, readBody, createError } from 'h3'
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { saveBudgetSlackConfig, DEFAULT_BUDGET_SLACK_CONFIG } from '~~/server/utils/budgetSlackConfig'
import { validateWebhook } from '~~/server/utils/anomalyDetection/slackBudget'

const Body = z.object({
  webhook_url: z.string().url().nullable().optional(),
  channel: z.string().nullable().optional(),
  digest_enabled: z.boolean().optional(),
  realtime_enabled: z.boolean().optional(),
  digest_hour: z.number().int().min(0).max(23).optional(),
  create_tasks: z.boolean().optional(),
  task_assignee_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid settings' })
  const body = parsed.data

  if (body.webhook_url && !validateWebhook(body.webhook_url)) {
    throw createError({ statusCode: 400, statusMessage: 'webhook_url must be a Slack incoming webhook (https://hooks.slack.com/services/...)' })
  }

  const cfg = { ...DEFAULT_BUDGET_SLACK_CONFIG, ...body } as any
  await saveBudgetSlackConfig(tenantId, cfg, user.id)
  return { ok: true }
})
