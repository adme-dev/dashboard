/**
 * POST /api/agency/ai/agent/trigger
 * Manually trigger an AI agent run (admin/owner only)
 */

import { runAgentDigest } from '~~/server/utils/aiAgentRunner'
import type { AgentRunType } from '~/types'

const VALID_RUN_TYPES: AgentRunType[] = ['daily_digest', 'weekly_report', 'anomaly_scan', 'manual']

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const body = await readBody(event)
  const runType = body?.runType as AgentRunType

  if (!runType || !VALID_RUN_TYPES.includes(runType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid runType. Must be one of: ${VALID_RUN_TYPES.join(', ')}`
    })
  }

  const result = await runAgentDigest(runType)

  return {
    success: true,
    runId: result.runId,
    reportCount: result.reportCount
  }
})
