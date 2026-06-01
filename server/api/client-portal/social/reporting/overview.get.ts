// server/api/client-portal/social/reporting/overview.get.ts — session-scoped, read-only.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { portalPeriodPostRows, portalAccountGrowth } from '~~/server/utils/socialReporting/portal'
import { buildOverview, cadenceByWeekday, rankBestContent } from '~~/server/utils/socialReporting/aggregate'

function firstUrl(pr: any): string | null {
  if (!pr || typeof pr !== 'object') return null
  for (const v of Object.values(pr)) { const u = (v as any)?.url; if (u) return String(u) }
  return null
}

/** GET /api/client-portal/social/reporting/overview?from=&to=&platform= — the client's OWN report. */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = getQuery(event)
  const to = q.to ? new Date(String(q.to)) : new Date()
  const from = q.from ? new Date(String(q.from)) : new Date(to.getTime() - 30 * 86400_000)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw createError({ statusCode: 400, statusMessage: 'invalid from/to range' })
  }
  const span = to.getTime() - from.getTime()
  const priorFrom = new Date(from.getTime() - span)
  const platform = q.platform && q.platform !== 'all' ? String(q.platform) : null
  const db = { queryRows }

  const [current, prior, growth] = await Promise.all([
    portalPeriodPostRows(db, client.clientId, from.toISOString(), to.toISOString(), platform),
    portalPeriodPostRows(db, client.clientId, priorFrom.toISOString(), from.toISOString(), platform),
    portalAccountGrowth(db, client.clientId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), platform),
  ])

  const best = rankBestContent(current, 5).map(r => ({
    postId: r.post_id, content: (r.content || '').slice(0, 140), permalink: firstUrl(r.platform_results),
    engagements: r.engagements, reach: r.reach, engagementRate: r.engagementRate,
  }))

  // Note: no engagement-ops/SLA block here — that's staff-internal (excluded from the client view).
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    kpis: buildOverview(current, prior),
    cadence: cadenceByWeekday(current),
    bestContent: best,
    accountGrowth: growth,
  }
})
