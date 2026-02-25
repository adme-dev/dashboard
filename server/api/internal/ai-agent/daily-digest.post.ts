/**
 * Internal: Trigger Daily Digest
 * POST /api/internal/ai-agent/daily-digest
 *
 * Called by the Cloudflare ai-agent-worker cron. Secured with INTERNAL_API_KEY.
 */

import { runAgentDigest } from '~~/server/utils/aiAgentRunner'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const expectedKey = process.env.INTERNAL_API_KEY

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const result = await runAgentDigest('daily_digest')

  return {
    success: true,
    runId: result.runId,
    reportCount: result.reportCount
  }
})
