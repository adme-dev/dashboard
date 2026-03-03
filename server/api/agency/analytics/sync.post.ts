/**
 * Sync all platform spend + breakdowns + creatives
 * POST /api/agency/analytics/sync
 *
 * Triggered from the analytics page "Sync All Platforms" button.
 * Body (optional): { month?: number, year?: number }
 *
 * Each platform gets a 60s timeout to prevent the request from hanging
 * indefinitely when an external API is unresponsive.
 */
import { requireAuth } from '~~/server/utils/auth'
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

const PLATFORM_TIMEOUT_MS = 60_000 // 60s per platform

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    promise
      .then((val) => { clearTimeout(timer); resolve(val) })
      .catch((err) => { clearTimeout(timer); reject(err) })
  })
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

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

  // Run all platforms in parallel with individual timeouts
  const settled = await Promise.allSettled(
    platforms.map(async (platform) => {
      try {
        const result = await withTimeout(
          platform.fn(month, year),
          PLATFORM_TIMEOUT_MS,
          platform.key,
        )
        return { key: platform.key, result }
      } catch (err: any) {
        console.error(`[AnalyticsSync] ${platform.key} failed:`, err.message)
        return { key: platform.key, error: err.message }
      }
    })
  )

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const { key, result, error } = outcome.value as any
      results[key] = error ? { error } : result
    } else {
      // Should not happen since inner try/catch handles everything
      console.error('[AnalyticsSync] Unexpected rejection:', outcome.reason)
    }
  }

  return { success: true, month, year, results }
})
