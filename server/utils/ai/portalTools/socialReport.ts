import { z } from 'zod'
import { portalPeriodPostRows } from '~~/server/utils/socialReporting/portal'
import { rollupPostMetrics, rankBestContent, engagementRate } from '~~/server/utils/socialReporting/aggregate'
import { ok, fail, portalDb, type PortalAiTool, type PortalToolContext, type ToolResult } from './portalContext'

const params = z.object({
  days: z.number().int().min(1).max(365).default(30),
  platform: z.string().trim().max(40).optional(),
})
type Args = z.infer<typeof params>

/** Injected clock so the date window is deterministic in tests; defaults to the real now. */
export type SocialReportDeps = { now: () => Date }
const defaultDeps: SocialReportDeps = { now: () => new Date() }

/**
 * The customer's social performance for the last N days. Reuses the tenant-safe `portalPeriodPostRows`
 * (WHERE p.client_id = $1) — clientScope is the tenant boundary; the customer's own client_id is the
 * only one ever queried. Returns period KPIs + top content (no raw firehose).
 */
export async function getMySocialReport(args: Args, ctx: PortalToolContext, deps: SocialReportDeps = defaultDeps): Promise<ToolResult> {
  try {
    const to = deps.now()
    const from = new Date(to.getTime() - args.days * 86_400_000)
    const platform = args.platform || null
    const rows = await portalPeriodPostRows(portalDb(ctx), ctx.clientScope, from.toISOString(), to.toISOString(), platform)

    const totals = rollupPostMetrics(rows)
    const top = rankBestContent(rows, 5).map(r => ({
      postId: r.post_id,
      platform: r.platform,
      publishedAt: r.published_at,
      engagements: r.engagements,
      engagementRate: r.engagementRate,
      // content is agency/customer-authored free text — keep a short preview only.
      preview: typeof r.content === 'string' ? r.content.slice(0, 120) : '',
    }))

    return ok({
      periodDays: args.days,
      platform: platform ?? 'all',
      postCount: rows.length,
      totals,
      engagementRate: engagementRate(totals.engagements, totals.reach, totals.impressions),
      topContent: top,
    })
  } catch {
    return fail('Could not load your social report right now.')
  }
}

export const getMySocialReportTool: PortalAiTool<Args> = {
  name: 'get_my_social_report',
  description: 'The customer\'s social media performance for the last N days (default 30) — post count, totalled '
    + 'reach/impressions/engagements and engagement rate, plus their top-performing posts. '
    + 'Use for "how did my social do last month", "my best posts", "social results". Optionally filter by platform. '
    + 'Read-only and scoped to the customer\'s own accounts.',
  parameters: params,
  returnsUntrusted: true,
  requiredPermission: 'canViewAnalytics',
  handler: (a, c) => getMySocialReport(a, c),
}
