import { requireAuth } from '~~/server/utils/auth'
import { syncTikTokSpend } from '~~/server/utils/spendSync'
import { enqueue } from '~~/server/utils/queue'
import { kvDelete } from '~~/server/utils/kv'

/**
 * POST /api/agency/social/tiktok/sync-spend
 * Pulls campaign-level spend from TikTok API and upserts into media_spend.
 * Body: { month?: number, year?: number, async?: boolean }
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const now = new Date()
  const month = body?.month || now.getMonth() + 1
  const year = body?.year || now.getFullYear()
  const async = body?.async === true
  const period = `${year}-${String(month).padStart(2, '0')}`

  // Async mode: enqueue and return immediately
  if (async) {
    const enqueued = await enqueue(event, 'spend.sync.tiktok', { month, year })
    if (enqueued) {
      return { status: 'queued', message: `TikTok spend sync for ${month}/${year} has been queued` }
    }
  }

  // Synchronous mode (default or queue fallback)
  const result = await syncTikTokSpend(month, year)

  // Bust KV cache for this period
  await Promise.all([
    kvDelete(event, `spend:summary:${period}:all`),
    kvDelete(event, `spend:summary:${period}:tiktok`),
    kvDelete(event, `spend:tiktok:accounts:${period}`),
    kvDelete(event, `spend:daily:tiktok:${period}`),
  ])

  return {
    synced: result.synced,
    accounts: 0,
    totalSpend: result.totalSpend,
  }
})
