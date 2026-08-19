import { z } from 'zod'
// Use Nitro's global $fetch (auto-imported), NOT raw ofetch — it resolves relative internal routes
// on the Cloudflare runtime; raw ofetch throws on a relative URL (no origin base). See #129.
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { buildDataHealth, mergeSyncFreshness, paginateWithCursor } from './responseContract'

const params = z.object({
  clientName: z.string().optional(),
  status: z.enum(['over_budget', 'critical', 'at_risk', 'underspend', 'healthy', 'partial_budget_coverage', 'no_budget_set', 'all']).default('all'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

/** One client/platform's budget health for the period (the budget-health tab's per-row shape). */
export type BudgetHealthClient = {
  clientName: string
  platform: string
  budget: number
  spend: number
  /** Spend as a % of allocated budget. */
  percentConsumed: number | null
  /** percentConsumed / month-progress; >1 = ahead of pace, <1 = behind. */
  pacingRatio: number | null
  healthStatus: string
  budgetLevel?: 'campaign' | 'client' | 'account'
  unattributed?: boolean
  lastSyncedAt?: string | null
  oldestSyncedAt?: string | null
  staleRowCount?: number
  campaignCount?: number
  budgetedCampaignCount?: number
  budgetCoverage?: { expectedCampaigns: number, budgetedCampaigns: number }
}

export type BudgetHealthData = {
  period: string
  summary: Record<string, number | null>
  clients: BudgetHealthClient[]
}

export type BudgetHealthDeps = {
  health: (ctx: ToolContext) => Promise<BudgetHealthData>
  now?: () => Date
}

// Real wiring: the budget-alerts/health endpoint is the same source the Budget Health tab uses;
// it defaults to the current month. Forward the caller's auth headers so the tenant/session
// resolves, mirroring adspend.ts.
const defaultDeps: BudgetHealthDeps = {
  health: async (ctx) => {
    const r: any = await aiInternalFetch('/api/agency/budget-alerts/health', {}, ctx)
    const clients: any[] = Array.isArray(r?.clients) ? r.clients : []
    return {
      period: String(r?.period ?? ''),
      summary: (r?.summary && typeof r.summary === 'object') ? r.summary : {},
      clients: clients.map((c): BudgetHealthClient => ({
        clientName: String(c?.clientName ?? 'Unmapped'),
        platform: String(c?.platform ?? ''),
        budget: Number(c?.budget ?? 0),
        spend: Number(c?.spend ?? 0),
        percentConsumed: c?.percentConsumed == null ? null : Number(c.percentConsumed),
        pacingRatio: c?.pacingRatio == null ? null : Number(c.pacingRatio),
        healthStatus: String(c?.healthStatus ?? ''),
        budgetLevel: 'client',
        unattributed: String(c?.clientId ?? '').toLowerCase() === 'unmapped'
          || String(c?.clientName ?? '').toLowerCase() === 'unmapped',
        lastSyncedAt: c?.lastSyncedAt ? String(c.lastSyncedAt) : null,
        oldestSyncedAt: c?.oldestSyncedAt ? String(c.oldestSyncedAt) : null,
        staleRowCount: Number.isFinite(Number(c?.staleRowCount)) ? Number(c.staleRowCount) : undefined,
        campaignCount: Number.isFinite(Number(c?.campaignCount)) ? Number(c.campaignCount) : undefined,
        budgetedCampaignCount: Number.isFinite(Number(c?.budgetedCampaignCount)) ? Number(c.budgetedCampaignCount) : undefined,
      })),
    }
  },
}

export async function getBudgetHealth(args: Args, ctx: ToolContext, deps: BudgetHealthDeps = defaultDeps): Promise<ToolResult> {
  try {
    const res = await deps.health(ctx)

    const nameNeedle = args.clientName?.trim().toLowerCase()
    const normalised = res.clients.map((c) => {
      const campaignCount = c.campaignCount
      const budgetedCampaignCount = c.budgetedCampaignCount
      const hasCoverageCounts = Number.isFinite(campaignCount) && Number.isFinite(budgetedCampaignCount)
      const hasPartialBudgetCoverage = c.budget > 0
        && hasCoverageCounts
        && Number(budgetedCampaignCount) < Number(campaignCount)
      const budgetCoverage = hasCoverageCounts
        ? { expectedCampaigns: Number(campaignCount), budgetedCampaigns: Number(budgetedCampaignCount) }
        : undefined

      return c.budget > 0
      ? {
          ...c,
          budgetLevel: c.budgetLevel ?? 'client',
          unattributed: Boolean(c.unattributed),
          budgetCoverage,
          healthStatus: hasPartialBudgetCoverage ? 'partial_budget_coverage' : c.healthStatus,
          percentConsumed: hasPartialBudgetCoverage ? null : c.percentConsumed,
          pacingRatio: hasPartialBudgetCoverage ? null : c.pacingRatio,
        }
      : {
          ...c,
          budget: null,
          percentConsumed: null,
          pacingRatio: null,
          healthStatus: 'no_budget_set',
          budgetLevel: c.budgetLevel ?? 'client',
          unattributed: Boolean(c.unattributed),
          budgetCoverage,
        }
    })
    const attributed = normalised.filter(c => !c.unattributed)
    const filtered = attributed.filter((c) => {
      if (nameNeedle && !c.clientName.toLowerCase().includes(nameNeedle)) return false
      if (args.status && args.status !== 'all' && c.healthStatus !== args.status) return false
      return true
    })
    const unattributed = normalised
      .filter(c => c.unattributed)
      .filter(c => !nameNeedle || c.clientName.toLowerCase().includes(nameNeedle))
    const page = paginateWithCursor(filtered, args.cursor, args.limit)
    const budgeted = attributed.filter(c => c.budget !== null)
    const pacingEligible = budgeted.filter(c => c.healthStatus !== 'partial_budget_coverage')
    const totalBudget = budgeted.reduce((sum, c) => sum + Number(c.budget), 0)
    const totalSpent = budgeted.reduce((sum, c) => sum + c.spend, 0)
    const trackedSpend = attributed.reduce((sum, c) => sum + c.spend, 0)
    const unattributedSpend = unattributed.reduce((sum, c) => sum + c.spend, 0)
    const health = buildDataHealth({
      configured: res.clients.length > 0,
      expected: attributed.length,
      withData: pacingEligible.length,
    })
    const partialBudgetCoverageCount = attributed.filter(c => c.healthStatus === 'partial_budget_coverage').length
    if ((unattributed.length > 0 || partialBudgetCoverageCount > 0) && health.dataStatus === 'populated') health.dataStatus = 'partial'
    const summary = {
      ...res.summary,
      totalBudget,
      totalSpent,
      budgetedSpend: totalSpent,
      totalRemaining: Math.round((totalBudget - totalSpent) * 100) / 100,
      trackedSpend,
      unattributedSpend,
      overallUtilization: partialBudgetCoverageCount > 0
        ? null
        : totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 10000) / 100 : 0,
      clientCount: attributed.length,
      excludedFromPacingCount: attributed.length - pacingEligible.length,
      partialBudgetCoverageCount,
      overBudgetCount: attributed.filter(c => c.healthStatus === 'over_budget').length,
    }

    return ok({
      period: res.period,
      source: 'budget_health',
      ...mergeSyncFreshness(normalised, { now: deps.now?.() }),
      ...health,
      summary,
      clients: page.items,
      unattributed,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
    })
  } catch {
    return fail('Could not load budget health — the spend sync may be unavailable or no budgets are set for this period.')
  }
}

export const budgetHealthTool: AiTool<Args> = {
  name: 'get_budget_health',
  description: 'Budget health for the current month per client/platform — allocated budget, spend, % consumed, coverage, and worst-case freshness (`lastSyncedAt`, `oldestSyncedAt`, `staleRowCount`, `stalenessThresholdHours`). '
    + 'Rows without a configured budget are `no_budget_set`; rows where only some campaigns have budgets are `partial_budget_coverage`. Both have null pacing values and are excluded from pacing conclusions. Unattributed account spend is returned separately. '
    + 'Use for "who is over budget", "which accounts are at risk", or "budget pacing this month". '
    + 'For per-campaign ROAS/CPC use get_campaign_breakdown; for cash use get_finance_snapshot. '
    + 'Optionally filter by status and use cursor/limit pagination.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => getBudgetHealth(a, c),
}
