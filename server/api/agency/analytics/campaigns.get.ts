import { readCampaignAnalytics } from '~~/server/utils/ai/marketing/campaignReads'
import { resolveBrowserMarketingReadScope } from '~~/server/utils/ai/marketing/readScope'
import { normalizeBudgetPlatform } from '~~/server/utils/campaignBudgetIdentity'

const ALLOWED_SORT: string[] = ['spend', 'budget', 'impressions', 'clicks', 'conversions', 'revenue', 'campaign_name', 'platform', 'lead_count', 'cost_per_lead', 'reach', 'cost_per_result', 'end_date', 'health_score']
export default defineEventHandler(async (event) => {
  const scope = await resolveBrowserMarketingReadScope(event)
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  const clientId = q.clientId as string | undefined
  const platforms = q.platform
    ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean).map(p => normalizeBudgetPlatform(p))
    : null
  const requestedSort = String(q.sortBy || '')
  const sortBy = ALLOWED_SORT.includes(requestedSort)
    ? requestedSort
    : 'spend'
  const sortDir = q.sortDir === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const search = q.search as string | undefined

  const showInactive = q.showInactive === 'true'

  return readCampaignAnalytics(scope, { startDate, endDate, clientId, platforms: platforms ?? undefined, search, showInactive, sortBy, sortDir, limit, offset })
})
