import { requireAuth } from '~~/server/utils/auth'
import { startSecondarySpendSyncPlatform } from '~~/server/utils/spendSyncKickoff'

/**
 * POST /api/agency/social/pinterest/sync-spend
 *
 * Kicks off pinterest spend sync through the durable queue and returns immediately (falls
 * back to the previous waitUntil-backed inline sync only when no JOBS_QUEUE binding is
 * available, e.g. local dev). See spendSyncKickoff.ts#startSecondarySpendSyncPlatform.
 *
 * Body: { month?: number, year?: number }
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const startedBy = typeof user === 'object' && user !== null && 'id' in user ? String(user.id) : null

  const body = await readBody(event).catch(() => null)
  const now = new Date()
  const month = Number(body?.month) || now.getMonth() + 1
  const year = Number(body?.year) || now.getFullYear()

  return await startSecondarySpendSyncPlatform(event, 'pinterest', month, year, startedBy)
})
