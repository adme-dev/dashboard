import { z } from 'zod'
// Use Nitro's global $fetch (auto-imported), NOT raw ofetch — it resolves relative internal routes
// on the Cloudflare runtime; raw ofetch throws on a relative URL (no origin base). See #129.
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { expectedToDate } from '~~/server/utils/anomalyDetection/adPacingMath'
import { buildDataHealth, paginateWithCursor } from './responseContract'

const params = z.object({
  clientName: z.string().optional(),
  platform: z.enum(['meta', 'google']).optional(),
  status: z.enum(['underpacing', 'overpacing', 'on_pace', 'no_budget_set', 'all']).default('all'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

export type PacingStatus = 'underpacing' | 'overpacing' | 'on_pace' | 'no_budget_set'

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
}

export type AdspendDeps = {
  pacing: (ctx: ToolContext) => Promise<PacingCampaign[]>
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
        budgetLevel: 'campaign',
        unattributed: String(it?.groupKey ?? '').includes(':unmapped:'),
        lastSyncedAt: it?.lastSyncedAt ? String(it.lastSyncedAt) : null,
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

function latestSync(rows: PacingCampaign[]) {
  return rows.reduce<string | null>((latest, row) => {
    if (!row.lastSyncedAt) return latest
    return !latest || row.lastSyncedAt > latest ? row.lastSyncedAt : latest
  }, null)
}

export async function getAdspendPacing(args: Args, ctx: ToolContext, deps: AdspendDeps = defaultDeps): Promise<ToolResult> {
  try {
    const all = await deps.pacing(ctx)

    const nameNeedle = args.clientName?.trim().toLowerCase()
    const matchesCommonFilters = (c: PacingCampaign) => {
      if (args.platform && c.platform !== args.platform) return false
      if (nameNeedle && !c.client.toLowerCase().includes(nameNeedle)) return false
      if (args.status === 'underpacing' && c.status !== 'underpacing') return false
      if (args.status === 'overpacing' && c.status !== 'overpacing') return false
      if (args.status === 'on_pace' && c.status !== 'on_pace') return false
      if (args.status === 'no_budget_set' && c.status !== 'no_budget_set') return false
      return true
    }

    const attributed = all.filter(c => !c.unattributed)
    const filtered = attributed.filter(matchesCommonFilters)
    const unattributed = all
      .filter(c => c.unattributed && matchesCommonFilters(c))
      .map(c => ({ ...c, accountName: c.client }))
    const page = paginateWithCursor(filtered, args.cursor, args.limit)
    const health = buildDataHealth({
      configured: all.length > 0,
      expected: attributed.length,
      withData: attributed.filter(c => c.budget !== null).length,
    })
    if (unattributed.length > 0 && health.dataStatus === 'populated') health.dataStatus = 'partial'

    return ok({
      period: currentPeriod(),
      source: 'synced_ad_platform_spend',
      lastSyncedAt: latestSync(all),
      ...health,
      campaigns: page.items,
      unattributed,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
      excludedFromPacingCount: attributed.filter(c => c.budget === null).length,
    })
  } catch {
    return fail('Could not load ad-spend pacing — the spend sync may be unavailable or no budgets are set for this period.')
  }
}

export const adspendTool: AiTool<Args> = {
  name: 'get_adspend_pacing',
  description: 'Get per-client ad-spend pacing for the current month across Meta and Google. Returns actual spend, budget level, allocated budget, expected-to-date pace, freshness and explicit data coverage. Spend without a configured budget is `no_budget_set` with null budget/pace — never underpacing. Unattributed account spend is returned separately. Use cursor/limit to paginate. Do NOT use for cash, runway, or accounts-receivable (use get_finance_snapshot).',
  parameters: params,
  requiredPermission: 'FINANCE',
  handler: (a, c) => getAdspendPacing(a, c),
}
