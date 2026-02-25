/**
 * GET /api/agency/ai/agent/reports/:id
 * Get a single AI agent report (marks as read)
 */

import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const reportId = getRouterParam(event, 'id')

  if (!reportId) {
    throw createError({ statusCode: 400, statusMessage: 'Report ID required' })
  }

  const report = await queryOne(`
    SELECT r.id, r.run_id, r.user_id, r.report_type, r.title,
           r.content, r.sections, r.notification_id, r.is_read, r.created_at,
           ar.run_type, ar.status as run_status, ar.findings_count,
           ar.checks_performed, ar.started_at as run_started_at
    FROM ai_agent_reports r
    LEFT JOIN ai_agent_runs ar ON r.run_id = ar.id
    WHERE r.id = $1
  `, [reportId])

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  // Verify user owns this report
  if (report.user_id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied' })
  }

  // Mark as read if not already
  if (!report.is_read) {
    await execute(`
      UPDATE ai_agent_reports SET is_read = true WHERE id = $1
    `, [reportId])
  }

  return {
    id: report.id,
    runId: report.run_id,
    userId: report.user_id,
    reportType: report.report_type,
    title: report.title,
    content: report.content,
    sections: report.sections,
    notificationId: report.notification_id,
    isRead: true,
    createdAt: report.created_at,
    run: {
      type: report.run_type,
      status: report.run_status,
      findingsCount: report.findings_count,
      checksPerformed: report.checks_performed,
      startedAt: report.run_started_at
    }
  }
})
