import { defineEventHandler, getHeader, createError } from 'h3'
import { syncGa4Dimensions } from '~~/server/utils/ga4DimensionSync'

/**
 * POST /api/cron/ga4-dimensions
 * Richer GA4 breakdowns (source/medium, campaign, device, landing page,
 * country) + event-level conversions. Auth: x-cron-secret (dev bypass).
 *
 * Heavier than the channel sync, so it runs in its own invocation and
 * processes only the stalest `maxProperties` per run (chunked multi-row
 * upserts keep it well under Cloudflare's per-invocation subrequest cap);
 * all properties converge over successive hourly runs. Idempotent.
 */
export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const dimensions = await syncGa4Dimensions({ lookbackDays: 14 })
  return { ok: true, dimensions }
})
