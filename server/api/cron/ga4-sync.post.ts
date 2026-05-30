import { defineEventHandler, getHeader, createError } from 'h3'
import { syncGa4 } from '~~/server/utils/ga4Sync'

/**
 * POST /api/cron/ga4-sync
 * Daily GA4 metrics pull across all mapped properties. Auth: x-cron-secret
 * (dev bypass). Schedule 0 * * * * is fine — it's idempotent; running hourly
 * just refreshes the 14-day window more often.
 */
export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const result = await syncGa4({ lookbackDays: 14 })
  return { ok: true, ...result }
})
