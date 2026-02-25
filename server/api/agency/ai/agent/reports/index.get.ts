/**
 * GET /api/agency/ai/agent/reports
 * List current user's AI agent reports
 */

import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)
  const typeFilter = query.type as string | undefined

  const params: any[] = [user.id]
  let whereClause = 'WHERE r.user_id = $1'

  if (typeFilter) {
    whereClause += ' AND r.report_type = $2'
    params.push(typeFilter)
  }

  const reports = await queryRows(`
    SELECT r.id, r.run_id, r.report_type, r.title, r.is_read, r.created_at,
           ar.status as run_status, ar.findings_count
    FROM ai_agent_reports r
    LEFT JOIN ai_agent_runs ar ON r.run_id = ar.id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT 30
  `, params)

  return reports.map(r => ({
    id: r.id,
    runId: r.run_id,
    reportType: r.report_type,
    title: r.title,
    isRead: r.is_read,
    createdAt: r.created_at,
    runStatus: r.run_status,
    findingsCount: r.findings_count
  }))
})
