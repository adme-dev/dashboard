import { createError } from 'h3'
import { requireMarketingReadPermission, requireScopedClient, type MarketingReadScope } from './readScope'
import { portalPeriodPostRows, portalAccountGrowth } from '~~/server/utils/socialReporting/portal'
import { queryRowsFresh as queryRows } from '~~/server/utils/db'
import { buildOverview, cadenceByWeekday, rankBestContent } from '~~/server/utils/socialReporting/aggregate'

function firstUrl(platformResults: any): string | null {
  if (!platformResults || typeof platformResults !== 'object') return null
  for (const v of Object.values(platformResults)) {
    const url = (v as any)?.url
    if (url) return String(url)
  }
  return null
}

export async function readSocialOverview(scope: MarketingReadScope, query: { clientId: string; from: string; to: string; platform?: string | null }) {
  requireMarketingReadPermission(scope, 'social')
  const clientId = query.clientId
  const to = query.to ? new Date(String(query.to)) : new Date()
  const from = query.from ? new Date(String(query.from)) : new Date(to.getTime() - 30 * 86400_000)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw createError({ statusCode: 400, statusMessage: 'invalid from/to range' })
  }
  await requireScopedClient(scope, clientId)
  const span = to.getTime() - from.getTime()
  const priorFrom = new Date(from.getTime() - span)
  const platform = query.platform && query.platform !== 'all' ? String(query.platform) : null

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
}
