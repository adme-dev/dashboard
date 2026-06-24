import { z } from 'zod'
// Use Nitro's global $fetch (auto-imported), NOT raw ofetch — it resolves relative internal routes
// on the Cloudflare runtime; raw ofetch throws on a relative URL (no origin base). See #129.
import type { AiTool } from '../toolRegistry'
import { ok, fail, capWithMore, type ToolContext, type ToolResult } from '../toolContext'

const params = z.object({
  clientName: z.string().optional(),
  platform: z.enum(['meta', 'google']).optional(),
  sortBy: z.enum(['spend', 'roas', 'cpc']).default('spend'),
})
type Args = z.infer<typeof params>

/** One campaign's model-readable spend/efficiency for the current period. */
export type BreakdownCampaign = {
  campaignName: string
  clientName: string
  platform: 'meta' | 'google'
  spend: number
  /** Return on ad spend (revenue/spend); null when there's no revenue. */
  roas: number | null
  /** Cost per click; null when there are no clicks. */
  cpc: number | null
}

/** The fetched window plus the endpoint's true total, so the handler can flag a truncated ranking. */
type BreakdownResult = { campaigns: BreakdownCampaign[], total: number }

export type CampaignBreakdownDeps = {
  breakdown: (ctx: ToolContext, platform?: 'meta' | 'google') => Promise<BreakdownResult>
}

// Real wiring: the analytics/campaigns endpoint is the same source the analytics tab uses. It
// requires a date window, so we ask for month-to-date. We forward the platform filter so the DB
// narrows the result instead of shipping every row, and capture the endpoint's `total` so the
// handler can warn when a ROAS/CPC ranking is computed over a spend-capped window (the endpoint
// can't sort by ROAS/CPC and hard-caps at 200). Forward the caller's auth headers so the
// tenant/session resolves, mirroring adspend.ts. Google is stored as 'google_ads' — normalise.
const PLATFORM_QUERY: Record<'meta' | 'google', string> = { meta: 'meta', google: 'google_ads,google' }

const defaultDeps: CampaignBreakdownDeps = {
  breakdown: async (ctx, platform) => {
    const now = new Date()
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const query: Record<string, unknown> = { startDate, endDate, sortBy: 'spend', limit: 200 }
    if (platform) query.platform = PLATFORM_QUERY[platform]
    const r: any = await $fetch('/api/agency/analytics/campaigns', {
      query,
      headers: ctx.event.headers as any,
    })
    const items: any[] = Array.isArray(r?.campaigns) ? r.campaigns : []
    const campaigns = items.map((it): BreakdownCampaign => {
      const rawPlatform = String(it?.platform ?? '')
      const p: 'meta' | 'google' = rawPlatform.startsWith('google') ? 'google' : 'meta'
      return {
        campaignName: String(it?.campaignName ?? 'Unknown'),
        clientName: String(it?.clientName ?? 'Unassigned'),
        platform: p,
        spend: Number(it?.spend ?? 0),
        roas: it?.roas == null ? null : Number(it.roas),
        cpc: it?.cpc == null ? null : Number(it.cpc),
      }
    })
    return { campaigns, total: Number(r?.total ?? campaigns.length) }
  },
}

// Higher value first for spend/roas; lower CPC is better, so cpc sorts ascending. Nulls always last.
function sortCampaigns(rows: BreakdownCampaign[], sortBy: Args['sortBy']): BreakdownCampaign[] {
  const asc = sortBy === 'cpc'
  return [...rows].sort((a, b) => {
    const av = a[sortBy]
    const bv = b[sortBy]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return asc ? av - bv : bv - av
  })
}

export async function getCampaignBreakdown(args: Args, ctx: ToolContext, deps: CampaignBreakdownDeps = defaultDeps): Promise<ToolResult> {
  try {
    const sortBy = args.sortBy ?? 'spend'
    const { campaigns: all, total } = await deps.breakdown(ctx, args.platform)

    const nameNeedle = args.clientName?.trim().toLowerCase()
    const filtered = all.filter((c) => {
      if (args.platform && c.platform !== args.platform) return false
      if (nameNeedle && !c.clientName.toLowerCase().includes(nameNeedle)) return false
      return true
    })

    const { items, more } = capWithMore(sortCampaigns(filtered, sortBy), 20)
    // The source endpoint ranks by spend and caps at 200, so a ROAS/CPC ranking over a truncated
    // window may miss high-ROAS low-spend campaigns. Tell the model so it doesn't over-claim "best".
    const note = (sortBy !== 'spend' && total > all.length)
      ? `Ranked by ${sortBy} over the ${all.length} highest-spend campaigns (of ${total}); lower-spend campaigns are not included in this ranking.`
      : undefined
    return ok({ campaigns: items, more, ...(note ? { note } : {}) })
  } catch {
    return fail('Could not load campaign breakdown — the spend sync may be unavailable or no campaigns have spend this period.')
  }
}

export const campaignBreakdownTool: AiTool<Args> = {
  name: 'get_campaign_breakdown',
  description: 'Per-campaign spend, ROAS and CPC for the current period across Meta and Google. '
    + 'Use for "which campaigns are wasting spend", "best/worst ROAS by campaign", or "CPC by campaign". '
    + 'Do NOT use for whole-account pacing (use get_adspend_pacing) or cash (use get_finance_snapshot). '
    + 'sortBy: spend (default, highest first), roas (highest first), cpc (lowest first). '
    + 'Returns a compact list capped at 20 with a `more` count.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => getCampaignBreakdown(a, c),
}
