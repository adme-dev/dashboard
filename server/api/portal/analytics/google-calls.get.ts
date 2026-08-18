import { createError, defineEventHandler, getQuery } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getGoogleAdsCallAnalytics } from '~~/server/utils/googleAdsCallAnalytics'

function assertDateOnly(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a YYYY-MM-DD date` })
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a valid YYYY-MM-DD date` })
  }
  return value
}

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const query = getQuery(event)
  const startDate = assertDateOnly(query.startDate, 'startDate')
  const endDate = assertDateOnly(query.endDate, 'endDate')
  if (startDate > endDate) throw createError({ statusCode: 400, statusMessage: 'startDate must be on or before endDate' })
  return getGoogleAdsCallAnalytics({ startDate, endDate, clientId: client.clientId })
})
