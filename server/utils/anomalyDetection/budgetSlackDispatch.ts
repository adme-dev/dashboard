import { queryRows } from '~~/server/utils/db'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'
import { buildCriticalBlocks, postSlack, validateWebhook, type BudgetSlackItem } from './slackBudget'

interface Row { type: string; severity: string; title: string; description: string; context: { client?: string } | null }

/**
 * Post newly-inserted CRITICAL budget anomalies to Slack in real time.
 * Flood-guarded (rollup when > 3) so the first detection run after deploy
 * doesn't spray dozens of pings. No-ops unless realtime is enabled and a valid
 * webhook is configured.
 */
export async function dispatchCriticalBudgetSlack(tenantId: string, anomalyIds: string[]): Promise<void> {
  if (anomalyIds.length === 0) return
  const cfg = await getBudgetSlackConfig(tenantId)
  if (!cfg.realtime_enabled || !cfg.webhook_url || !validateWebhook(cfg.webhook_url)) return

  const rows = await queryRows<Row>(
    `SELECT type, severity, title, description, context
     FROM anomalies
     WHERE id = ANY($1) AND type IN ('adspend','budget')`,
    [anomalyIds],
  )
  if (rows.length === 0) return

  const items: BudgetSlackItem[] = rows.map(r => ({
    type: r.type, severity: r.severity, title: r.title, description: r.description, client: r.context?.client ?? null,
  }))
  await postSlack(cfg.webhook_url, buildCriticalBlocks(items), cfg.channel ?? undefined)
}
