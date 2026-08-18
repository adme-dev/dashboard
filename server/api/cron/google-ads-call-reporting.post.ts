import { createError, defineEventHandler, getHeader, getQuery } from 'h3'
import { syncGoogleAdsCalls } from '~~/server/utils/googleAdsCallReporting'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

/**
 * POST /api/cron/google-ads-call-reporting
 *
 * Daily is sufficient. The default rolling 14-day query is idempotent and one
 * SearchStream request costs one Google Ads API operation per connected account:
 * https://developers.google.com/google-ads/api/docs/best-practices/quotas#search_requests
 */
export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const startDate = typeof query.startDate === 'string' ? query.startDate : undefined
  const endDate = typeof query.endDate === 'string' ? query.endDate : undefined
  let lookbackDays: number | undefined
  if (query.lookbackDays !== undefined) {
    lookbackDays = Number(query.lookbackDays)
    if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 90) {
      throw createError({ statusCode: 400, statusMessage: 'lookbackDays must be an integer from 1 to 90' })
    }
  }

  const runtimeConfig = resolveGoogleAdsRuntimeConfig(undefined, event)
  const result = await syncGoogleAdsCalls({ startDate, endDate, lookbackDays, runtimeConfig })
  return { ok: result.errors.length === 0, ...result }
})
