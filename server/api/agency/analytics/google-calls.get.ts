import { createError, defineEventHandler, getQuery } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { getGoogleAdsCallAnalytics } from '~~/server/utils/googleAdsCallAnalytics'
import { PERMISSIONS } from '~~/server/utils/permissions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const query = getQuery(event)
  const startDate = assertDateOnly(query.startDate, 'startDate')
  const endDate = assertDateOnly(query.endDate, 'endDate')
  if (startDate > endDate) throw createError({ statusCode: 400, statusMessage: 'startDate must be on or before endDate' })
  const clientId = typeof query.clientId === 'string' && query.clientId.trim() ? query.clientId.trim() : null
  if (clientId && !UUID.test(clientId)) throw createError({ statusCode: 400, statusMessage: 'clientId must be a UUID' })
  return getGoogleAdsCallAnalytics({ startDate, endDate, clientId })
})
