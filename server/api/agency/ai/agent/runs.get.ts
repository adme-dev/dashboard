/**
 * GET /api/agency/ai/agent/runs
 * List recent AI agent runs (admin/owner only)
 */

import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const runs = await queryRows(`
    SELECT id, run_type, status, started_at, completed_at,
           duration_ms, checks_performed, findings_count,
           notifications_sent, errors, summary, created_at
    FROM ai_agent_runs
    ORDER BY created_at DESC
    LIMIT 20
  `)

  return runs.map(r => ({
    id: r.id,
    runType: r.run_type,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationMs: r.duration_ms,
    checksPerformed: r.checks_performed,
    findingsCount: r.findings_count,
    notificationsSent: r.notifications_sent,
    errors: r.errors,
    summary: r.summary,
    createdAt: r.created_at
  }))
})
