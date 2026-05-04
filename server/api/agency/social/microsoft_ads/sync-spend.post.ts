import { requireAuth } from '~~/server/utils/auth'
import { syncMicrosoftSpend } from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'

/**
 * POST /api/agency/social/microsoft_ads/sync-spend
 *
 * Kicks off Microsoft Ads spend sync in the background via waitUntil and
 * returns immediately. Microsoft's async reporting can take 10–30s on its
 * own, so inline execution is especially prone to CF Pages timeouts.
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
    label: `microsoft_ads sync-spend ${period}`,
    sync: () => syncMicrosoftSpend(month, year),
    kvKeys: [
      `spend:summary:${period}:all`,
      `spend:summary:${period}:microsoft_ads`,
      `spend:microsoft_ads:accounts:${period}`,
      `spend:daily:microsoft_ads:${period}`,
    ],
  })
})
