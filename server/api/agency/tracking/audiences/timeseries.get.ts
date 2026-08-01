import type { AudienceMetric } from '~~/app/types/audience-analytics'
import { requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { parseAudienceRange } from '~~/server/utils/tracking/audience-analytics'
import { getAudienceTimeseries } from '~~/server/utils/tracking/audience-repository'

const METRICS = new Set<AudienceMetric>([
  'visitors',
  'sessions',
  'engagedSessions',
  'leadActions',
  'confirmedLeads'
])

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const metric = stringValue(query.metric) ?? 'visitors'
  if (!METRICS.has(metric as AudienceMetric)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown audience metric' })
  }

  const range = parseAudienceRange({
    from: stringValue(query.from),
    to: stringValue(query.to)
  })
  const { clientIds } = await requireTrackingAudienceScope(event, stringValue(query.clientId))
  return getAudienceTimeseries({
    range,
    clientIds,
    metric: metric as AudienceMetric
  })
})
