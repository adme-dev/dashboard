import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok } from '../toolContext'
import type { ToolContext, ToolResult } from '../toolContext'
import { queryRows } from '~~/server/utils/db'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { isActionablePacingItem } from '~~/server/utils/automation/pacingWatchdog'

const params = z.object({
  issueType: z.enum(['overpacing', 'underpacing', 'no_spend', 'paused_with_budget', 'stale_sync']).optional(),
})
type Args = z.infer<typeof params>

async function checkPacing(args: Args, _ctx: ToolContext): Promise<ToolResult> {
  const now = new Date()
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const rows = await queryRows<PacingReviewRow>(
    `SELECT ${PACING_REVIEW_SELECT_COLUMNS} FROM media_spend ms LEFT JOIN agency_clients ac ON ac.id = ms.client_id WHERE ms.period = $1`,
    [period],
  )
  const review = buildPacingReview(rows, { now, period })
  let items = review.items.filter(isActionablePacingItem)
  if (args.issueType) items = items.filter(i => i.issueType === args.issueType)
  const top = items.slice(0, 25).map(i => ({
    client: i.clientName, campaign: i.campaignName, platform: i.platform,
    issue: i.issueType, severity: i.severity, pacingRatio: i.pacingRatio,
    currentDailyBudget: i.currentDailyBudget, recommendedDailyBudget: i.recommendedDailyBudget,
    recommendedAction: i.recommendedAction,
  }))
  return ok({ period, count: items.length, items: top })
}

export const checkPacingTool: AiTool<Args> = {
  name: 'check_pacing',
  description: 'List campaigns with current ad-spend pacing issues (over/under-pacing, no-spend, paused-with-budget, stale data) for the current month. Each item has the client, campaign, platform, issue type, severity, current vs recommended daily budget, and a recommended action. Use for "what is pacing badly / which campaigns are overspending / what needs a budget review". Read-only — it never changes any budget. Optionally filter by issueType.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => checkPacing(a, c),
}
