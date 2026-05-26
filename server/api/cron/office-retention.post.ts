/**
 * POST /api/cron/office-retention
 * Applies office meeting and recording retention policies.
 */
import { runOfficeRetentionCleanup } from '~~/server/utils/officeRetention'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET
  if (!import.meta.dev && cronSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const result = await runOfficeRetentionCleanup()

  return {
    ok: true,
    ...result
  }
})
