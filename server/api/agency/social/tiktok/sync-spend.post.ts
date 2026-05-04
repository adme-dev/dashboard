import { requireAuth } from '~~/server/utils/auth'
import { syncTikTokSpend } from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'

/**
 * POST /api/agency/social/tiktok/sync-spend
 *
 * Kicks off TikTok campaign spend sync in the background via waitUntil and
 * returns immediately. See meta/sync-spend.post.ts for the rationale.
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
    label: `tiktok sync-spend ${period}`,
    sync: () => syncTikTokSpend(month, year),
    kvKeys: [
      `spend:summary:${period}:all`,
      `spend:summary:${period}:tiktok`,
      `spend:tiktok:accounts:${period}`,
      `spend:daily:tiktok:${period}`,
    ],
  })
})
