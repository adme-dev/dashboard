import { isUuid, requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { parseAudienceRange } from '~~/server/utils/tracking/audience-analytics'
import { listSiteIntelligenceChangesRead } from '~~/server/utils/siteIntelligence/repository'

const LANES = new Set(['owned', 'competitor'])
const CHANGE_TYPES = new Set(['page_added', 'facts_changed'])

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function boundedLimit(value: unknown, maximum: number, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid limit' })
  }
  return Math.min(maximum, Math.max(1, Number(value)))
}

function parseCursor(value: unknown): { observedAt: string, id: string } | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
  }
  const separator = value.lastIndexOf('|')
  const observedAt = value.slice(0, separator)
  const id = value.slice(separator + 1)
  const parsed = new Date(observedAt)
  if (separator < 1 || Number.isNaN(parsed.getTime()) || !isUuid(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
  }
  return { observedAt: parsed.toISOString(), id }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clientId = stringValue(query.clientId)
  const laneValue = stringValue(query.lane)
  const changeTypeValue = stringValue(query.changeType)
  if (query.lane !== undefined && (!laneValue || !LANES.has(laneValue))) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown site intelligence lane' })
  }
  if (query.changeType !== undefined && (!changeTypeValue || !CHANGE_TYPES.has(changeTypeValue))) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown site intelligence change type' })
  }
  const range = parseAudienceRange({
    from: stringValue(query.from),
    to: stringValue(query.to)
  })
  const scope = await requireTrackingAudienceScope(event, clientId)
  return listSiteIntelligenceChangesRead({
    clientIds: scope.clientIds,
    range,
    limit: boundedLimit(query.limit, 100, 50),
    cursor: parseCursor(query.cursor),
    ...(laneValue ? { lane: laneValue as 'owned' | 'competitor' } : {}),
    ...(changeTypeValue ? { changeType: changeTypeValue as 'page_added' | 'facts_changed' } : {})
  })
})
