import { z } from 'zod'
import { $fetch } from 'ofetch'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { expectedToDate } from '~~/server/utils/anomalyDetection/adPacingMath'

const params = z.object({
  clientName: z.string().optional(),
  platform: z.enum(['meta', 'google']).optional(),
  status: z.enum(['underpacing', 'overpacing', 'all']).default('all'),
})
type Args = z.infer<typeof params>

export type PacingStatus = 'underpacing' | 'overpacing' | 'on_pace'

export type PacingCampaign = {
  client: string
  platform: 'meta' | 'google'
  spend: number
  budget: number
  /** Spend as a % of the budget that should have been spent by today (100 = on pace). */
  pacePct: number
  status: PacingStatus
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
    const r = await $fetch<any>('/api/agency/social/spend/summary', { headers: ctx.event.headers as any })
    const now = new Date()
    const items: any[] = Array.isArray(r?.items) ? r.items : []
    return items.map((it): PacingCampaign => {
      const budget = Number(it?.budget ?? 0)
      const spend = Number(it?.spend ?? 0)
      const expected = expectedToDate(budget, now)
      const pacePct = expected > 0 ? Math.round((spend / expected) * 100) : 0
      // summary.get.ts stores Google as 'google_ads'; normalise to the tool's enum.
      const rawPlatform = String(it?.platform ?? '')
      const platform: 'meta' | 'google' = rawPlatform.startsWith('google') ? 'google' : 'meta'
      return {
        client: String(it?.clientName ?? 'Unknown'),
        platform,
        spend,
        budget,
        pacePct,
        status: classify(pacePct),
      }
    })
  },
}

export async function getAdspendPacing(args: Args, ctx: ToolContext, deps: AdspendDeps = defaultDeps): Promise<ToolResult> {
  try {
    const all = await deps.pacing(ctx)

    const nameNeedle = args.clientName?.trim().toLowerCase()
    const filtered = all.filter((c) => {
      if (args.platform && c.platform !== args.platform) return false
      if (nameNeedle && !c.client.toLowerCase().includes(nameNeedle)) return false
      if (args.status === 'underpacing' && c.status !== 'underpacing') return false
      if (args.status === 'overpacing' && c.status !== 'overpacing') return false
      return true
    })

    const projected: PacingCampaign[] = filtered.map(c => ({
      client: c.client,
      platform: c.platform,
      spend: c.spend,
      budget: c.budget,
      pacePct: c.pacePct,
      status: c.status,
    }))

    return ok({
      campaigns: projected.slice(0, 20),
      more: Math.max(0, projected.length - 20),
    })
  } catch {
    return fail('Could not load ad-spend pacing — the spend sync may be unavailable or no budgets are set for this period.')
  }
}

export const adspendTool: AiTool<Args> = {
  name: 'get_adspend_pacing',
  description: 'Get per-client ad-spend pacing for the current month across Meta and Google — actual spend, allocated budget, pace % (spend vs. expected-to-date burn), and a status of underpacing/overpacing/on_pace. Use for "are any campaigns under/over pacing", "is <client> spending their budget", or "how is Meta delivery this month". Do NOT use for cash, runway, or accounts-receivable (use get_finance_snapshot). Returns a compact list of campaigns (capped at 20 with a `more` count).',
  parameters: params,
  requiredPermission: 'FINANCE',
  handler: (a, c) => getAdspendPacing(a, c),
}
