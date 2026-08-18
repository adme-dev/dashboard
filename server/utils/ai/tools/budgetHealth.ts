import { z } from 'zod'
// Use Nitro's global $fetch (auto-imported), NOT raw ofetch — it resolves relative internal routes
// on the Cloudflare runtime; raw ofetch throws on a relative URL (no origin base). See #129.
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { buildDataHealth, paginateWithCursor } from './responseContract'

const params = z.object({
  clientName: z.string().optional(),
  status: z.enum(['over_budget', 'critical', 'at_risk', 'underspend', 'healthy', 'no_budget_set', 'all']).default('all'),
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
  percentConsumed: number
  /** percentConsumed / month-progress; >1 = ahead of pace, <1 = behind. */
  pacingRatio: number
  healthStatus: string
  budgetLevel?: 'campaign' | 'client' | 'account'
  unattributed?: boolean
  lastSyncedAt?: string | null
}

export type BudgetHealthData = {
  period: string
  summary: Record<string, number>
  clients: BudgetHealthClient[]
}

export type BudgetHealthDeps = {
  health: (ctx: ToolContext) => Promise<BudgetHealthData>
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
        percentConsumed: Number(c?.percentConsumed ?? 0),
        pacingRatio: Number(c?.pacingRatio ?? 0),
        healthStatus: String(c?.healthStatus ?? ''),
        budgetLevel: 'campaign',
        unattributed: String(c?.clientId ?? '').toLowerCase() === 'unmapped'
          || String(c?.clientName ?? '').toLowerCase() === 'unmapped',
        lastSyncedAt: c?.lastSyncedAt ? String(c.lastSyncedAt) : null,
      })),
    }
  },
}

export async function getBudgetHealth(args: Args, ctx: ToolContext, deps: BudgetHealthDeps = defaultDeps): Promise<ToolResult> {
  try {
    const res = await deps.health(ctx)

    const nameNeedle = args.clientName?.trim().toLowerCase()
    const normalised = res.clients.map(c => c.budget > 0
      ? { ...c, budgetLevel: c.budgetLevel ?? 'campaign', unattributed: Boolean(c.unattributed) }
      : {
          ...c,
          budget: null,
          percentConsumed: null,
          pacingRatio: null,
          healthStatus: 'no_budget_set',
          budgetLevel: c.budgetLevel ?? 'campaign',
          unattributed: Boolean(c.unattributed),
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
    const totalBudget = budgeted.reduce((sum, c) => sum + Number(c.budget), 0)
    const totalSpent = budgeted.reduce((sum, c) => sum + c.spend, 0)
    const trackedSpend = attributed.reduce((sum, c) => sum + c.spend, 0)
    const unattributedSpend = unattributed.reduce((sum, c) => sum + c.spend, 0)
    const health = buildDataHealth({
      configured: res.clients.length > 0,
      expected: attributed.length,
      withData: budgeted.length,
    })
    if (unattributed.length > 0 && health.dataStatus === 'populated') health.dataStatus = 'partial'
    const lastSyncedAt = normalised.reduce<string | null>((latest, row) => {
      if (!row.lastSyncedAt) return latest
      return !latest || row.lastSyncedAt > latest ? row.lastSyncedAt : latest
    }, null)
    const summary = {
      ...res.summary,
      totalBudget,
      totalSpent,
      trackedSpend,
      unattributedSpend,
      overallUtilization: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 10000) / 100 : 0,
      clientCount: attributed.length,
      excludedFromPacingCount: attributed.length - budgeted.length,
    }

    return ok({
      period: res.period,
      source: 'budget_health',
      lastSyncedAt,
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
  description: 'Budget health for the current month per client/platform — allocated budget, spend, % consumed, freshness and coverage. '
    + 'Rows without a configured budget are `no_budget_set` with null budget/pacing values and are excluded from utilization. Unattributed account spend is returned separately. '
    + 'Use for "who is over budget", "which accounts are at risk", or "budget pacing this month". '
    + 'For per-campaign ROAS/CPC use get_campaign_breakdown; for cash use get_finance_snapshot. '
    + 'Optionally filter by status and use cursor/limit pagination.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => getBudgetHealth(a, c),
}
