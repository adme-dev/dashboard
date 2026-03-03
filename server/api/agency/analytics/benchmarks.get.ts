/**
 * Analytics Benchmarks
 * GET /api/agency/analytics/benchmarks
 *
 * Query params: platform?, industry?
 * Queries platform_benchmarks table.
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)

  const platform = q.platform as string | undefined
  const industry = q.industry as string | undefined

  const conditions: string[] = []
  const params: any[] = []
  let idx = 1

  if (platform) {
    conditions.push(`pb.platform = $${idx}`)
    params.push(platform)
    idx++
  }
  if (industry) {
    conditions.push(`pb.industry = $${idx}`)
    params.push(industry)
    idx++
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const rows = await queryRows(`
      SELECT
        pb.platform,
        pb.industry,
        pb.metric,
        pb.value,
        pb.source
      FROM platform_benchmarks pb
      ${where}
      ORDER BY pb.platform, pb.industry, pb.metric
    `, params)

    return {
      benchmarks: rows.map(r => ({
        platform: r.platform,
        industry: r.industry,
        metric: r.metric,
        value: Number(r.value),
        source: r.source,
      }))
    }
  } catch (error: any) {
    // Table may not exist yet — graceful degradation
    if (error?.message?.includes('does not exist')) {
      return { benchmarks: [], _notice: 'Benchmarks table not yet created' }
    }
    console.error('Analytics benchmarks failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch benchmarks' })
  }
})
