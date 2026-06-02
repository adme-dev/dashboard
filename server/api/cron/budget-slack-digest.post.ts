// Hourly cron entrypoint; self-gates to the tenant-local digest hour (default 9).
// Posts a Slack budget review of active ad-spend/budget anomalies, or an
// all-clear message when there are none. Auth: x-cron-secret vs CRON_SECRET.
import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'
import { buildDigestBlocks, postSlack, validateWebhook, type BudgetSlackItem } from '~~/server/utils/anomalyDetection/slackBudget'

const APP_BASE = process.env.APP_BASE_URL || 'https://agency-dashboard-6cm.pages.dev'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const force = (() => { const q = getQuery(event); return q.force === 'true' || q.force === '1' })()

  const conn = await queryOne<{ tenant_id: string; timezone: string }>(
    `SELECT tenant_id, timezone FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`,
  )
  if (!conn) return { ok: true, skipped: 'no Xero connection' }

  const cfg = await getBudgetSlackConfig(conn.tenant_id)
  if (!cfg.digest_enabled || !cfg.webhook_url || !validateWebhook(cfg.webhook_url)) {
    return { ok: true, skipped: 'digest disabled or webhook not configured' }
  }

  const tz = conn.timezone || 'Australia/Sydney'
  let localHour: number
  try {
    localHour = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))
  } catch {
    localHour = new Date().getUTCHours()
  }
  if (!force && localHour !== cfg.digest_hour) {
    return { ok: true, skipped: `local hour=${localHour}, digest_hour=${cfg.digest_hour}` }
  }

  const rows = await queryRows<{ type: string; severity: string; title: string; description: string; context: { client?: string } | null }>(
    `SELECT type, severity, title, description, context
     FROM anomalies
     WHERE tenant_id = $1
       AND type IN ('adspend','budget')
       AND status NOT IN ('resolved','dismissed')
       AND (snoozed_until IS NULL OR snoozed_until < NOW())
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_detected_at DESC`,
    [conn.tenant_id],
  )
  const items: BudgetSlackItem[] = rows.map(r => ({
    type: r.type, severity: r.severity, title: r.title, description: r.description, client: r.context?.client ?? null,
  }))
  const date = new Date().toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
  const res = await postSlack(cfg.webhook_url, buildDigestBlocks(items, { date, dashboardUrl: `${APP_BASE}/agency/anomalies` }), cfg.channel ?? undefined)

  return { ok: res.ok, posted: items.length, error: res.error }
})
