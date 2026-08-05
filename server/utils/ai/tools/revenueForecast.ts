import { z } from 'zod'
// Use Nitro's global $fetch (auto-imported), NOT raw ofetch — it resolves relative internal routes
// on the Cloudflare runtime; raw ofetch throws on a relative URL (no origin base). See #129.
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'

const params = z.object({
  horizon: z.enum(['month', 'quarter']).default('month'),
})
type Args = z.infer<typeof params>

export type ForecastDeps = {
  fetchForecast: (ctx: ToolContext) => Promise<any>
  fetchCoverage: (ctx: ToolContext) => Promise<any>
}

// Internal route fetch via ofetch with the caller's headers forwarded so Xero connection + tenant
// resolve in the endpoint. Mirrors the prod-verified pattern in finance.ts.
const defaultDeps: ForecastDeps = {
  fetchForecast: ctx => aiInternalFetch('/api/xero/get-out/forecast', {}, ctx),
  fetchCoverage: ctx => aiInternalFetch('/api/xero/get-out/pipeline-coverage', {}, ctx),
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function forecastRevenue(args: Args, ctx: ToolContext, deps: ForecastDeps = defaultDeps): Promise<ToolResult> {
  try {
    if (args.horizon === 'quarter') {
      const c = await deps.fetchCoverage(ctx)
      return ok({
        horizon: 'quarter',
        quarterlyTarget: num(c?.quarterlyTarget),
        pipelineOpen: num(c?.pipeline?.totalWeighted),
        coverageFace: c?.coverage?.face ?? null,
        coverageWeighted: c?.coverage?.weighted ?? null,
        band: c?.coverage?.band ?? 'unknown',
      })
    }
    const f = await deps.fetchForecast(ctx)
    return ok({
      horizon: 'month',
      target: num(f?.target),
      invoiced: num(f?.layers?.invoiced),
      arCollectible: num(f?.layers?.arCollectible),
      recurring: num(f?.layers?.recurring),
      quotesProbable: num(f?.layers?.quotesProbable),
      leakage: num(f?.leakage?.total),
      projected: num(f?.totalProjected),
      gap: num(f?.gap),
      surplus: num(f?.surplus),
      onTrack: Boolean(f?.onTrack),
    })
  } catch {
    return fail('Could not load the revenue forecast — Xero may be disconnected.')
  }
}

export const revenueForecastTool: AiTool<Args> = {
  name: 'forecast_revenue',
  description: 'Where revenue is heading. horizon="month" projects month-end landing (invoiced + collectible AR + recurring + weighted quotes, minus leakage) vs the Get-Out target. horizon="quarter" gives 90-day pipeline coverage (open pipeline / quarterly target + a health band). Use for "are we going to hit target / what\'s our pipeline coverage / month-end revenue forecast". Returns compact numbers only.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => forecastRevenue(a, c),
}
