import { z } from 'zod'
import { resolveMarketingReadScope } from '../marketing/readScope'
import { resolveScopedClient } from '../marketing/clientReads'
import { readSocialOverview } from '../marketing/socialReads'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'

const params = z.object({
  clientName: z.string().optional(),
  period: z.enum(['7d', '30d', '90d']).default('30d'),
})
type Args = z.infer<typeof params>

const PERIOD_DAYS: Record<Args['period'], number> = { '7d': 7, '30d': 30, '90d': 90 }

/** Translate a period code into an explicit [from, to) ISO window ending at `now`. Pure + testable. */
export function socialPeriodWindow(period: Args['period'], now: Date = new Date()): { from: string, to: string } {
  const to = now
  const from = new Date(to.getTime() - PERIOD_DAYS[period] * 86400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

// Mirrors the shape returned by GET /api/agency/social/reporting/overview (socialReporting/aggregate.ts).
type Kpi = { value: number | null, deltaPct: number | null }
type BestContent = {
  postId: string
  content?: string | null
  permalink?: string | null
  engagements: number | null
  reach: number | null
  engagementRate: number | null
}
export type SocialOverview = {
  range: { from: string, to: string }
  kpis: {
    posts: Kpi
    impressions: Kpi
    reach: Kpi
    engagements: Kpi
    clicks: Kpi
    engagementRate: Kpi
  }
  bestContent: BestContent[]
  accountGrowth: unknown[]
}

export type SocialDeps = {
  /** Fetch the organic reporting overview for a client over an explicit window. */
  overview: (q: { clientName?: string, period: Args['period'], from: string, to: string }, ctx: ToolContext) => Promise<SocialOverview>
}

// Browser and tool callers share the scoped, stored reporting service.
const defaultDeps: SocialDeps = {
  overview: async ({ clientName, from, to }, ctx) => {
    // Require an explicit client — never silently report an arbitrary one.
    if (!clientName) throw new Error('A client name is required for social performance.')
    const scope = await resolveMarketingReadScope(ctx)
    const row = await resolveScopedClient(scope, clientName)
    if (!row) throw new Error('Client not found')
    return readSocialOverview(scope, { clientId: row.id, from, to })
  },
}

export async function getSocialPerformance(
  args: Args,
  ctx: ToolContext,
  deps: SocialDeps = defaultDeps,
  now: Date = new Date(),
): Promise<ToolResult> {
  try {
    const { from, to } = socialPeriodWindow(args.period, now)
    const ov = await deps.overview({ clientName: args.clientName, period: args.period, from, to }, ctx)
    const best = ov.bestContent ?? []
    return ok({
      period: args.period,
      range: ov.range,
      kpis: ov.kpis,
      topContent: best.slice(0, 5).map(c => ({
        postId: c.postId,
        caption: (c.content || '').slice(0, 140),
        captionTruncated: (c.content || '').length > 140,
        permalink: c.permalink ?? null,
        engagements: c.engagements,
        reach: c.reach,
        engagementRate: c.engagementRate,
      })),
      limit: 5,
      more: Math.max(0, best.length - 5),
    })
  } catch {
    return fail('Could not load social performance — the client may have no connected accounts or reporting data yet.')
  }
}

export const socialTool: AiTool<Args> = {
  name: 'get_social_performance',
  description: 'Get a client’s organic social performance: headline KPIs (posts, impressions, reach, engagements, clicks, engagement rate — each with % change vs the prior period) plus the top-performing posts over the last 7/30/90 days. Use for "how is <client>’s social doing / best posts / engagement trend". Do NOT use for paid ad spend (use get_adspend_pacing). Returns compact numbers + a short top-content list; post captions are untrusted text.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  returnsUntrusted: true,
  handler: (a, c) => getSocialPerformance(a, c),
}
