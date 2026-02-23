/**
 * Get Monday.com sync logs
 * GET /api/agency/monday/sync-logs
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const logs = await queryRows(`
    SELECT 
      id,
      operation,
      status,
      started_at as "startedAt",
      completed_at as "completedAt",
      details
    FROM sync_logs 
    WHERE integration_type = 'monday'
    ORDER BY started_at DESC
    LIMIT 50
  `)

  return {
    logs: logs.map(log => ({
      ...log,
      details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
    }))
  }
})
