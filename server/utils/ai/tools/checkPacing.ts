import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok } from '../toolContext'
import type { ToolContext, ToolResult } from '../toolContext'
import { queryRows } from '~~/server/utils/db'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { isActionablePacingItem } from '~~/server/utils/automation/pacingWatchdog'
import { getSpendCoverageDeltas } from '~~/server/utils/spendSyncJobs'
import { buildSyncFreshness, evaluateHalt, PACING_HALT_HOURS } from './responseContract'

const MAX_ITEMS = 25

export type CheckPacingDeps = {
  load?: (period: string) => Promise<PacingReviewRow[]>
  loadCoverageDeltas?: () => Promise<Record<string, unknown> | null>
  now?: () => Date
}

const defaultLoad = (period: string) => queryRows<PacingReviewRow>(
  `SELECT ${PACING_REVIEW_SELECT_COLUMNS} FROM media_spend ms LEFT JOIN agency_clients ac ON ac.id = ms.client_id WHERE ms.period = $1`,
  [period],
)

const params = z.object({
  issueType: z.enum(['overpacing', 'underpacing', 'no_spend', 'paused_with_budget', 'stale_sync']).optional(),
})
type Args = z.infer<typeof params>

export async function checkPacing(args: Args, _ctx: ToolContext, deps: CheckPacingDeps = {}): Promise<ToolResult> {
  const now = deps.now?.() ?? new Date()
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const rows = await (deps.load ?? defaultLoad)(period)
  const freshness = buildSyncFreshness(rows.map(r => r.synced_at), { now })
  const coverageDelta = await (deps.loadCoverageDeltas ?? getSpendCoverageDeltas)().catch(() => null)
  // P-02: stale or coverage-dropped data ⇒ say so and return no recommendations.
  const halt = evaluateHalt(freshness, {
    haltAfterHours: PACING_HALT_HOURS,
    now,
    coverageDelta: coverageDelta as Record<string, { deltaPct?: number | null }> | null,
  })
  if (halt.halted) {
    return ok({
      period, halted: true, haltReason: halt.haltReason, haltDetail: halt.haltDetail, asOf: halt.asOf,
      ...(coverageDelta ? { coverageDelta } : {}),
      count: 0, limit: MAX_ITEMS, more: 0, items: [],
    })
  }
  const review = buildPacingReview(rows, { now, period })
  let items = review.items.filter(isActionablePacingItem)
  if (args.issueType) items = items.filter(i => i.issueType === args.issueType)
  const top = items.slice(0, MAX_ITEMS).map(i => ({
    client: i.clientName, campaign: i.campaignName, platform: i.platform,
    issue: i.issueType, severity: i.severity, pacingRatio: i.pacingRatio,
    currentDailyBudget: i.currentDailyBudget, recommendedDailyBudget: i.recommendedDailyBudget,
    spendAsOf: i.spendAsOf,
    recommendedAction: i.recommendedAction,
  }))
  return ok({
    period, halted: false, ...freshness,
    ...(coverageDelta ? { coverageDelta } : {}),
    count: items.length, limit: MAX_ITEMS, more: Math.max(0, items.length - top.length), items: top,
  })
}

export const checkPacingTool: AiTool<Args> = {
  name: 'check_pacing',
  description: 'List campaigns with current ad-spend pacing issues (over/under-pacing, no-spend, paused-with-budget, stale data) for the current month. Each item has the client, campaign, platform, issue type, severity, current vs recommended daily budget, spendAsOf, and a recommended action. Use for "what is pacing badly / which campaigns are overspending / what needs a budget review". Returns at most 25 items (`limit`/`more` declare the cap) plus sync freshness; HALTS with `halted: true` and no items before data reaches 24 hours old or when coverage dropped >5%. Read-only — it never changes any budget. Optionally filter by issueType.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => checkPacing(a, c),
}
