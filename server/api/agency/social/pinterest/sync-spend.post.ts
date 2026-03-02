import { requireAuth } from '~~/server/utils/auth'
import { syncPinterestSpend } from '~~/server/utils/spendSync'
import { enqueue } from '~~/server/utils/queue'
import { kvDelete } from '~~/server/utils/kv'

/**
 * POST /api/agency/social/pinterest/sync-spend
 * Pulls campaign-level spend from Pinterest API and upserts into media_spend.
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
    const enqueued = await enqueue(event, 'spend.sync.pinterest', { month, year })
    if (enqueued) {
      return { status: 'queued', message: `Pinterest spend sync for ${month}/${year} has been queued` }
    }
  }

  // Synchronous mode (default or queue fallback)
  const result = await syncPinterestSpend(month, year)

  // Bust KV cache for this period
  await Promise.all([
    kvDelete(event, `spend:summary:${period}:all`),
    kvDelete(event, `spend:summary:${period}:pinterest`),
    kvDelete(event, `spend:pinterest:accounts:${period}`),
    kvDelete(event, `spend:daily:pinterest:${period}`),
  ])

  return {
    synced: result.synced,
    accounts: 0,
    totalSpend: result.totalSpend,
  }
})
