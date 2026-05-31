import { defineEventHandler, getHeader, createError } from 'h3'
import { runDueReports } from '~~/server/utils/reports/runReports'

/**
 * POST /api/cron/scheduled-reports
 * Runs every enabled report schedule that is due. Auth: x-cron-secret (dev
 * bypass). Schedule daily (e.g. 0 6 * * *); each schedule self-gates on its
 * cadence via isReportDue, so running daily is safe.
 */
export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const result = await runDueReports(event)
  return { ok: true, ...result }
})
