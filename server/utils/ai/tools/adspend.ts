import { z } from 'zod'
import { getSpendCoverageDeltas } from '~~/server/utils/spendSyncJobs'
// Use Nitro's global $fetch (auto-imported), NOT raw ofetch — it resolves relative internal routes
// on the Cloudflare runtime; raw ofetch throws on a relative URL (no origin base). See #129.
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { expectedToDate } from '~~/server/utils/anomalyDetection/adPacingMath'
import { buildDataHealth, mergeSyncFreshness, paginateWithCursor } from './responseContract'

const params = z.object({
  clientName: z.string().optional(),
  platform: z.enum(['meta', 'google']).optional(),
  status: z.enum(['underpacing', 'overpacing', 'on_pace', 'partial_budget_coverage', 'no_budget_set', 'all']).default('all'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

export type PacingStatus = 'underpacing' | 'overpacing' | 'on_pace' | 'partial_budget_coverage' | 'no_budget_set'

export type PacingCampaign = {
  client: string
  platform: 'meta' | 'google'
  spend: number
  budget: number | null
  /** Spend as a % of the budget that should have been spent by today (100 = on pace). */
  pacePct: number | null
  status: PacingStatus
  budgetLevel: 'campaign' | 'client' | 'account'
  unattributed: boolean
  lastSyncedAt: string | null
  oldestSyncedAt?: string | null
  staleRowCount?: number
  campaignCount?: number
  budgetedCampaignCount?: number
  budgetCoverage?: { expectedCampaigns: number, budgetedCampaigns: number }
}

export type AdspendDeps = {
  loadCoverageDeltas?: () => Promise<Record<string, unknown> | null>

  pacing: (ctx: ToolContext) => Promise<PacingCampaign[]>
  now?: () => Date
}

// Pace thresholds mirror the adspendHealth detectors: underspend triggers below
// ~0.5 of expected-to-date, overspend when projecting >1.15× budget. We classify
// on the simpler MTD-vs-expected ratio here for a compact, model-readable answer.
const UNDERPACE_PCT = 85 // < 85% of expected-to-date spend
const OVERPACE_PCT = 115 // > 115% of expected-to-date spend

function classify(pacePct: number): PacingStatus {
  if (pacePct < UNDERPACE_PCT) return 'underpacing'
  if (pacePct > OVERPACE_PCT) return 'overpacing'
  return 'on_pace'
}

// Real wiring: spend data is route-mediated via the spend summary endpoint (the
// same source the spend pages use). Forward the caller's auth headers so the
// tenant/session resolves, mirroring finance.ts. The summary returns one row per
// client+platform with budget + actual spend for the current period; we derive
// pace against the expected-to-date budget burn.
const defaultDeps: AdspendDeps = {
  pacing: async (ctx) => {
    const r: any = await aiInternalFetch('/api/agency/social/spend/summary', {}, ctx)
    const now = new Date()
    const items: any[] = Array.isArray(r?.items) ? r.items : []
    return items.map((it): PacingCampaign => {
      const budget = Number(it?.budget ?? 0)
      const spend = Number(it?.spend ?? 0)
      const hasBudget = Number.isFinite(budget) && budget > 0
      const expected = hasBudget ? expectedToDate(budget, now) : 0
      const pacePct = expected > 0 ? Math.round((spend / expected) * 100) : null
      // summary.get.ts stores Google as 'google_ads'; normalise to the tool's enum.
      const rawPlatform = String(it?.platform ?? '')
      const platform: 'meta' | 'google' = rawPlatform.startsWith('google') ? 'google' : 'meta'
      return {
        client: String(it?.clientName ?? 'Unknown'),
        platform,
        spend,
        budget: hasBudget ? budget : null,
        pacePct,
        status: pacePct === null ? 'no_budget_set' : classify(pacePct),
        budgetLevel: 'client',
        unattributed: String(it?.groupKey ?? '').includes(':unmapped:'),
        lastSyncedAt: it?.lastSyncedAt ? String(it.lastSyncedAt) : null,
        oldestSyncedAt: it?.oldestSyncedAt ? String(it.oldestSyncedAt) : null,
        staleRowCount: Number.isFinite(Number(it?.staleRowCount)) ? Number(it.staleRowCount) : undefined,
        campaignCount: Number.isFinite(Number(it?.campaignCount)) ? Number(it.campaignCount) : undefined,
        budgetedCampaignCount: Number.isFinite(Number(it?.budgetedCampaignCount)) ? Number(it.budgetedCampaignCount) : undefined,
      }
    })
  },
}

function currentPeriod() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const iso = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return { start: iso(start), end: iso(end) }
}

export async function getAdspendPacing(args: Args, ctx: ToolContext, deps: AdspendDeps = defaultDeps): Promise<ToolResult> {
  try {
    const sourceRows = await deps.pacing(ctx)
    const all = sourceRows.map((c) => {
      const hasCoverageCounts = Number.isFinite(c.campaignCount) && Number.isFinite(c.budgetedCampaignCount)
      const hasPartialBudgetCoverage = c.budget !== null
        && hasCoverageCounts
        && Number(c.budgetedCampaignCount) < Number(c.campaignCount)
      return {
        ...c,
        budgetLevel: 'client' as const,
        status: hasPartialBudgetCoverage ? 'partial_budget_coverage' as const : c.status,
        pacePct: hasPartialBudgetCoverage ? null : c.pacePct,
        budgetCoverage: hasCoverageCounts
          ? { expectedCampaigns: Number(c.campaignCount), budgetedCampaigns: Number(c.budgetedCampaignCount) }
          : undefined,
      }
    })

    const nameNeedle = args.clientName?.trim().toLowerCase()
    const matchesCommonFilters = (c: PacingCampaign) => {
      if (args.platform && c.platform !== args.platform) return false
      if (nameNeedle && !c.client.toLowerCase().includes(nameNeedle)) return false
      if (args.status === 'underpacing' && c.status !== 'underpacing') return false
      if (args.status === 'overpacing' && c.status !== 'overpacing') return false
      if (args.status === 'on_pace' && c.status !== 'on_pace') return false
      if (args.status === 'partial_budget_coverage' && c.status !== 'partial_budget_coverage') return false
      if (args.status === 'no_budget_set' && c.status !== 'no_budget_set') return false
      return true
    }

    const attributed = all.filter(c => !c.unattributed)
    const filtered = attributed.filter(matchesCommonFilters)
    const unattributed = all
      .filter(c => c.unattributed && matchesCommonFilters(c))
      .map(c => ({ ...c, accountName: c.client }))
    const coverageDelta = await (deps.loadCoverageDeltas ?? getSpendCoverageDeltas)().catch(() => null)
    const page = paginateWithCursor(filtered, args.cursor, args.limit)
    const health = buildDataHealth({
      configured: all.length > 0,
      expected: attributed.length,
      withData: attributed.filter(c => c.budget !== null && c.status !== 'partial_budget_coverage').length,
    })
    if (unattributed.length > 0 && health.dataStatus === 'populated') health.dataStatus = 'partial'

    return ok({
      period: currentPeriod(),
      source: 'synced_ad_platform_spend',
      ...mergeSyncFreshness(all, { now: deps.now?.() }),
      ...(coverageDelta ? { coverageDelta } : {}),
      ...health,
      campaigns: page.items,
      unattributed,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
      excludedFromPacingCount: attributed.filter(c => c.budget === null || c.status === 'partial_budget_coverage').length,
    })
  } catch {
    return fail('Could not load ad-spend pacing — the spend sync may be unavailable or no budgets are set for this period.')
  }
}

export const adspendTool: AiTool<Args> = {
  name: 'get_adspend_pacing',
  description: 'Get per-client ad-spend pacing for the current month across Meta and Google. Returns actual spend, budget level, allocated budget, expected-to-date pace, explicit data coverage, and worst-case freshness (`lastSyncedAt`, `oldestSyncedAt`, `staleRowCount`, `stalenessThresholdHours`). Spend without a configured budget is `no_budget_set`; incomplete campaign budget coverage is `partial_budget_coverage`. Both have null pace and are excluded from pacing conclusions. Unattributed account spend is returned separately. Use cursor/limit to paginate. Do NOT use for cash, runway, or accounts-receivable (use get_finance_snapshot).',
  parameters: params,
  requiredPermission: 'FINANCE',
  handler: (a, c) => getAdspendPacing(a, c),
}
