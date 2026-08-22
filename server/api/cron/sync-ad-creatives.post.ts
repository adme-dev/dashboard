// Daily ad-creative text sync (headlines / descriptions / primary text) into campaign_creatives.
// Driven by the pages-cron worker after the morning spend sync so creative rows attach to
// same-day media_spend rows. Auth: x-cron-secret, like every /api/cron/* route.
// Runs in the background via waitUntil so the cron call never hits the function time limit.
import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { syncAllCampaignCreatives, type CreativeSyncPlatform } from '~~/server/utils/adCreativeSync'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const q = getQuery(event)
  const now = new Date()
  const month = parseInt(String(q.month || now.getMonth() + 1), 10)
  const year = parseInt(String(q.year || now.getFullYear()), 10)
  const platforms: CreativeSyncPlatform[] = q.platform === 'google'
    ? ['google_ads']
    : q.platform === 'meta'
      ? ['meta']
      : ['google_ads', 'meta']

  runAfterResponse(event, syncAllCampaignCreatives(month, year, platforms), `cron sync-ad-creatives ${year}-${month}`)
  return { ok: true, started: true, month, year, platforms }
})
