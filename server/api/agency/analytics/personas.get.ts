import { requireAuth } from '~~/server/utils/auth'
import { parsePersonaMetricFilters } from '~~/server/utils/persona/http'
import { getCachedPersonaMetrics } from '~~/server/utils/persona/snapshots'

export default defineEventHandler(async event => {
  await requireAuth(event)
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid clientId is required' })
  }
  setHeader(event, 'Cache-Control', 'private, max-age=60, stale-while-revalidate=300')
  return getCachedPersonaMetrics(
    clientId,
    parsePersonaMetricFilters(query as Record<string, unknown>)
  )
})
