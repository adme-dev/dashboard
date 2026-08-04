import { createError, getHeader } from 'h3'
import { reconcileGodModeExecutions } from '~~/server/utils/godMode/reconciliation'

export default defineEventHandler(async (event) => {
  const expected = process.env.CRON_SECRET
  if (!expected || getHeader(event, 'x-cron-secret') !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return { ok: true, ...(await reconcileGodModeExecutions()) }
})
