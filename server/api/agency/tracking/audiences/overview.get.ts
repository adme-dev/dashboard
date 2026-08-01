import { requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { parseAudienceRange } from '~~/server/utils/tracking/audience-analytics'
import { getAudienceOverview } from '~~/server/utils/tracking/audience-repository'

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const range = parseAudienceRange({
    from: stringValue(query.from),
    to: stringValue(query.to)
  })
  const { clientIds, accessibleClientIds } = await requireTrackingAudienceScope(
    event,
    stringValue(query.clientId)
  )

  return getAudienceOverview({ range, clientIds, accessibleClientIds })
})
