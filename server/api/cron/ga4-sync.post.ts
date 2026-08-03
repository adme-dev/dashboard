import { defineEventHandler, getHeader, createError } from 'h3'
import { syncGa4 } from '~~/server/utils/ga4Sync'
import { resolveGoogleOAuthRuntimeConfig } from '~~/server/utils/googleOAuthRuntimeConfig'

/**
 * POST /api/cron/ga4-sync
 * GA4 channel-metrics pull across all mapped properties. Auth: x-cron-secret
 * (dev bypass). Schedule 0 * * * * is fine — idempotent; running hourly
 * refreshes the 14-day window (always re-pulling the trailing ~48h).
 *
 * Richer dimension/event breakdowns run in a SEPARATE cron
 * (/api/cron/ga4-dimensions) so the two don't share one invocation's
 * Cloudflare subrequest budget.
 */
export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const { googleClientId, googleClientSecret } = resolveGoogleOAuthRuntimeConfig(event)
  const channels = await syncGa4({
    lookbackDays: 14,
    oauthConfig: { googleClientId, googleClientSecret }
  })
  return { ok: true, channels }
})
