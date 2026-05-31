import { defineEventHandler, getHeader, createError } from 'h3'
import { syncGa4 } from '~~/server/utils/ga4Sync'
import { syncGa4Dimensions } from '~~/server/utils/ga4DimensionSync'

/**
 * POST /api/cron/ga4-sync
 * Daily GA4 pull across all mapped properties: channel metrics + richer
 * dimension/event breakdowns. Auth: x-cron-secret (dev bypass). Schedule
 * 0 * * * * is fine — idempotent; running hourly refreshes the 14-day window
 * more often. The dimension pull batches reports and self-throttles on quota.
 */
export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const channels = await syncGa4({ lookbackDays: 14 })
  const dimensions = await syncGa4Dimensions({ lookbackDays: 14 })
  return { ok: true, channels, dimensions }
})
