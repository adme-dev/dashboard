import { requireClientAuth } from '~~/server/utils/clientAuth'
import { parsePersonaMetricFilters } from '~~/server/utils/persona/http'
import { getCachedPersonaMetrics } from '~~/server/utils/persona/snapshots'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  setHeader(event, 'Cache-Control', 'private, max-age=60, stale-while-revalidate=300')

  if (client.leadCaptureMode !== 'full_crm') {
    return {
      enabled: false,
      generatedAt: new Date().toISOString(),
      period: { startDate: null, endDate: null },
      metrics: null,
      sourceMix: [],
      lifecycleMix: []
    }
  }

  const query = getQuery(event)
  return getCachedPersonaMetrics(
    client.clientId,
    parsePersonaMetricFilters(query as Record<string, unknown>)
  )
})
