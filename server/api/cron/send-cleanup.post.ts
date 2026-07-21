import { runSendCleanup } from '~~/server/utils/send/cleanup'
import { runSendReconciliation } from '~~/server/utils/send/reconciliation'

export default defineEventHandler(async (event) => {
  const expectedSecret = process.env.CRON_SECRET
  const suppliedSecret = getHeader(event, 'x-cron-secret')
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const cleanup = await runSendCleanup()
  const reconciliation = await runSendReconciliation()
  return {
    ok: true,
    cleanup,
    reconciliation
  }
})
