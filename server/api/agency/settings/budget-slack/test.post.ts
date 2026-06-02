import { defineEventHandler, createError } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'
import { postSlack, validateWebhook } from '~~/server/utils/anomalyDetection/slackBudget'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const cfg = await getBudgetSlackConfig(tenantId)
  if (!cfg.webhook_url || !validateWebhook(cfg.webhook_url)) {
    throw createError({ statusCode: 400, statusMessage: 'Save a valid Slack webhook first' })
  }
  const res = await postSlack(cfg.webhook_url, [{
    type: 'section',
    text: { type: 'mrkdwn', text: '*✅ XeroFlow budget review — test message*\nYour Slack budget alerts are configured correctly.' },
  }], cfg.channel ?? undefined)
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Slack post failed: ${res.error}` })
  return { ok: true }
})
