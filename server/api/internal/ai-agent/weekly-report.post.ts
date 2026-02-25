/**
 * Internal: Trigger Weekly Report
 * POST /api/internal/ai-agent/weekly-report
 *
 * Called by the Cloudflare ai-agent-worker cron on Sundays. Secured with INTERNAL_API_KEY.
 */

import { runAgentDigest } from '~~/server/utils/aiAgentRunner'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const expectedKey = process.env.INTERNAL_API_KEY

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const result = await runAgentDigest('weekly_report')

  return {
    success: true,
    runId: result.runId,
    reportCount: result.reportCount
  }
})
