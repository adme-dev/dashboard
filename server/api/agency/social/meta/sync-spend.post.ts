import { requireAuth } from '~~/server/utils/auth'
import { syncMetaSpend } from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'

/**
 * POST /api/agency/social/meta/sync-spend
 *
 * Kicks off Meta campaign spend sync in the background via waitUntil and
 * returns immediately. The sync loop over multiple ad accounts almost always
 * exceeds CF Pages' ~30s function limit when run inline, which surfaces as a
 * 504 to the browser. Polling `last_synced_at` from the connections endpoint
 * tells the UI when the background work has completed.
 *
 * Body: { month?: number, year?: number }
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event).catch(() => null)
  const now = new Date()
  const month = body?.month || now.getMonth() + 1
  const year = body?.year || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`

  return runSpendSyncInBackground(event, {
    label: `meta sync-spend ${period}`,
    sync: () => syncMetaSpend(month, year),
    kvKeys: [
      `spend:summary:${period}:all`,
      `spend:summary:${period}:meta`,
      `spend:meta:accounts:${period}`,
      `spend:daily:meta:${period}`,
    ],
  })
})
