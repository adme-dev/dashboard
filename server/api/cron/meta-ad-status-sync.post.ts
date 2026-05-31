// server/api/cron/meta-ad-status-sync.post.ts
//
// Cron entrypoint for Meta ad status sync. Refreshes
// `banner_ad_publishes.status` from Meta's live effective_status for every
// non-terminal ad published in the last 30 days.
//
// Trigger: a Cloudflare Cron Trigger (configured in the CF dashboard) hits this
// hourly. No tenant/time gate — every hit runs a capped batch.
//
// Auth: x-cron-secret header matched against CRON_SECRET env var. Skipped in dev
// so it can be triggered manually.
import { defineEventHandler, getHeader, createError } from 'h3'
import { syncMetaAdStatuses } from '~~/server/utils/metaAdStatusSync'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (!import.meta.dev && cronSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const result = await syncMetaAdStatuses({ limit: 100 })
  return { ok: true, ...result }
})
