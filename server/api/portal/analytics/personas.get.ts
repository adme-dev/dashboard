import { requireClientAuth } from '~~/server/utils/clientAuth'
import { parsePersonaMetricFilters } from '~~/server/utils/persona/http'
import { getCachedPersonaMetrics } from '~~/server/utils/persona/snapshots'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  if (client.leadCaptureMode !== 'full_crm') {
    return {
      enabled: false,
      generatedAt: new Date().toISOString(),
      period: { startDate: null, endDate: null },
      metrics: null,
      sourceMix: [],
      lifecycleMix: [],
      providerFeedback: { pending: 0, published: 0, failed: 0 }
    }
  }
  return getCachedPersonaMetrics(
    client.clientId,
    parsePersonaMetricFilters(getQuery(event) as Record<string, unknown>)
  )
})
