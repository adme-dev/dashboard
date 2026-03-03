/**
 * Analytics Cross-sell Recommendations
 * GET /api/agency/analytics/cross-sell
 *
 * Query params: clientId?, limit?
 */
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)

  const clientId = q.clientId as string | undefined
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100)

  try {
    const { getCrossSellRecommendations } = await import('~~/server/utils/crossSellEngine')
    const recommendations = await getCrossSellRecommendations({ clientId, limit })
    return { recommendations }
  } catch (error: any) {
    // crossSellEngine may not exist yet — graceful degradation
    if (error?.code === 'MODULE_NOT_FOUND' || error?.message?.includes('Cannot find module')) {
      return { recommendations: [], _notice: 'Cross-sell engine not yet available' }
    }
    console.error('Cross-sell recommendations failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch cross-sell recommendations' })
  }
})
