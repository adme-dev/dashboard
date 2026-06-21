import { z } from 'zod'
// Use Nitro's global $fetch (auto-imported), NOT raw ofetch — it resolves relative internal routes
// on the Cloudflare runtime; raw ofetch throws on a relative URL (no origin base). See #129.
import type { AiTool } from '../toolRegistry'
import { ok, fail, capWithMore, type ToolContext, type ToolResult } from '../toolContext'

const params = z.object({
  clientName: z.string().optional(),
  status: z.enum(['over_budget', 'critical', 'at_risk', 'underspend', 'healthy', 'all']).default('all'),
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
    const r: any = await $fetch('/api/agency/budget-alerts/health', { headers: ctx.event.headers as any })
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
      })),
    }
  },
}

export async function getBudgetHealth(args: Args, ctx: ToolContext, deps: BudgetHealthDeps = defaultDeps): Promise<ToolResult> {
  try {
    const res = await deps.health(ctx)

    const nameNeedle = args.clientName?.trim().toLowerCase()
    const filtered = res.clients.filter((c) => {
      if (nameNeedle && !c.clientName.toLowerCase().includes(nameNeedle)) return false
      if (args.status && args.status !== 'all' && c.healthStatus !== args.status) return false
      return true
    })

    const { items, more } = capWithMore(filtered, 20)
    return ok({ period: res.period, summary: res.summary, clients: items, more })
  } catch {
    return fail('Could not load budget health — the spend sync may be unavailable or no budgets are set for this period.')
  }
}

export const budgetHealthTool: AiTool<Args> = {
  name: 'get_budget_health',
  description: 'Budget health for the current month per client/platform — allocated budget, spend, % consumed, '
    + 'pacing ratio (vs month progress) and a health status (over_budget/critical/at_risk/underspend/healthy). '
    + 'Use for "who is over budget", "which accounts are at risk", or "budget pacing this month". '
    + 'For per-campaign ROAS/CPC use get_campaign_breakdown; for cash use get_finance_snapshot. '
    + 'Optionally filter by status. Returns a period summary plus a per-client list capped at 20 with a `more` count.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => getBudgetHealth(a, c),
}
