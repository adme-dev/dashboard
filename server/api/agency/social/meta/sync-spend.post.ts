/**
 * Manual Meta ad-spend sync kickoff. Thin wrapper over startSpendSyncPlatform so the
 * HTTP path, the cron path, and the MCP run_adspend_sync tool share one implementation.
 */
import { requireAuth } from '~~/server/utils/auth'
import { startSpendSyncPlatform } from '~~/server/utils/spendSyncKickoff'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const startedBy = typeof user === 'object' && user !== null && 'id' in user ? String(user.id) : null

  const body = await readBody(event).catch(() => null)
  const now = new Date()
  const month = Number(body?.month) || now.getMonth() + 1
  const year = Number(body?.year) || now.getFullYear()

  return await startSpendSyncPlatform(event, 'meta', month, year, startedBy)
})
