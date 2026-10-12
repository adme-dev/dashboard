import { portalPeriodPostRows, portalAccountGrowth } from '~~/server/utils/socialReporting/portal'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildOverview, cadenceByWeekday, rankBestContent } from '~~/server/utils/socialReporting/aggregate'

/**
 * GET /api/agency/social/reporting/overview?clientId=&from=&to=&platform=
 * Headline organic-reporting block: KPIs with deltas vs the prior equal-length period, posting
 * cadence, top content, and account follower/reach growth. One round-trip for the dashboard hero.
 * (Engagement-ops metrics come from /api/agency/social/inbox/analytics/overview — reused by the UI.)
 */

function firstUrl(platformResults: any): string | null {
  if (!platformResults || typeof platformResults !== 'object') return null
  for (const v of Object.values(platformResults)) {
    const url = (v as any)?.url
    if (url) return String(url)
  }
  return null
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const to = q.to ? new Date(String(q.to)) : new Date()
  const from = q.from ? new Date(String(q.from)) : new Date(to.getTime() - 30 * 86400_000)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw createError({ statusCode: 400, statusMessage: 'invalid from/to range' })
  }
  const span = to.getTime() - from.getTime()
  const priorFrom = new Date(from.getTime() - span)
  const platform = q.platform && q.platform !== 'all' ? String(q.platform) : null

  const [current, prior, growth] = await Promise.all([
    portalPeriodPostRows({ queryRows }, clientId, from.toISOString(), to.toISOString(), platform),
    portalPeriodPostRows({ queryRows }, clientId, priorFrom.toISOString(), from.toISOString(), platform),
    portalAccountGrowth({ queryRows }, clientId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), platform),
  ])

  const best = rankBestContent(current, 5).map(r => ({
    postId: r.post_id, content: (r.content || '').slice(0, 140), permalink: firstUrl(r.platform_results),
    engagements: r.engagements, reach: r.reach, engagementRate: r.engagementRate,
  }))

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    kpis: buildOverview(current, prior),
    cadence: cadenceByWeekday(current),
    bestContent: best,
    accountGrowth: growth,
  }
})
