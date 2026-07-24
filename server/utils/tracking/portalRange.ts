/**
 * Parse portal-style date ranges for analytics endpoints.
 * Portal passes startDate/endDate; agency endpoints use from/to.
 * This helper supports both to keep callers compact.
 */
import type { H3Event } from 'h3'
import { parseRange } from '~~/server/utils/tracking/analytics-range'

interface PortalRangeQuery {
  startDate?: string
  endDate?: string
  from?: string
  to?: string
}

export function parsePortalTrackingRange(event: H3Event): { fromDate: string; toDate: string } {
  const q = getQuery(event) as PortalRangeQuery
  const from = q.startDate ?? q.from
  const to = q.endDate ?? q.to

  if (!from || !to) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  return parseRange({ from, to })
}
