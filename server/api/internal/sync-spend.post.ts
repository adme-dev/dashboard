/**
 * Internal: Sync all platform spend + breakdowns + creatives
 * POST /api/internal/sync-spend
 *
 * Called by Cloudflare Worker cron trigger (daily).
 * Secured with INTERNAL_API_KEY.
 *
 * Body (optional): { month?: number, year?: number }
 */
import {
  syncMetaSpend,
  syncGoogleSpend,
  syncMicrosoftSpend,
  syncPinterestSpend,
  syncTikTokSpend,
  syncLinkedinSpend,
  syncSnapchatSpend,
  syncTwitterSpend,
} from '~~/server/utils/spendSync'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const expectedKey = process.env.INTERNAL_API_KEY

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event).catch(() => null)
  const now = new Date()
  const month = body?.month || now.getMonth() + 1
  const year = body?.year || now.getFullYear()

  const results: Record<string, { synced: number; totalSpend: number } | { error: string }> = {}

  const platforms = [
    { key: 'meta', fn: syncMetaSpend },
    { key: 'google_ads', fn: syncGoogleSpend },
    { key: 'microsoft_ads', fn: syncMicrosoftSpend },
    { key: 'pinterest', fn: syncPinterestSpend },
    { key: 'tiktok', fn: syncTikTokSpend },
    { key: 'linkedin', fn: syncLinkedinSpend },
    { key: 'snapchat', fn: syncSnapchatSpend },
    { key: 'twitter', fn: syncTwitterSpend },
  ]

  for (const platform of platforms) {
    try {
      results[platform.key] = await platform.fn(month, year)
    } catch (err: any) {
      console.error(`[CronSync] ${platform.key} failed:`, err.message)
      results[platform.key] = { error: err.message }
    }
  }

  return { success: true, month, year, results }
})
