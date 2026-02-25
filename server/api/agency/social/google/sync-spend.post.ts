import { requireAuth } from '~~/server/utils/auth'
import { syncGoogleSpend } from '~~/server/utils/spendSync'
import { enqueue } from '~~/server/utils/queue'

/**
 * POST /api/agency/social/google/sync-spend
 * Pulls campaign-level spend from Google Ads API and upserts into media_spend.
 * Body: { month?: number, year?: number, async?: boolean }
 *
 * With async=true, enqueues the sync and returns immediately.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const now = new Date()
  const month = body?.month || now.getMonth() + 1
  const year = body?.year || now.getFullYear()
  const async = body?.async === true

  // Async mode: enqueue and return immediately
  if (async) {
    const enqueued = await enqueue(event, 'spend.sync.google', { month, year })
    if (enqueued) {
      return { status: 'queued', message: `Google spend sync for ${month}/${year} has been queued` }
    }
  }

  // Synchronous mode (default or queue fallback)
  const result = await syncGoogleSpend(month, year)

  return {
    synced: result.synced,
    accounts: 0, // Not tracked in shared util, kept for API compat
    totalSpend: result.totalSpend,
  }
})
