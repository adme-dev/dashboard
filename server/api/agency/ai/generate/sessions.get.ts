/**
 * List AI Generation Sessions
 * GET /api/agency/ai/generate/sessions
 *
 * Query params:
 * - status: Filter by status
 * - templateId: Filter by template
 * - clientId: Filter by client
 * - limit: Number of results (default 20)
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const limit = Math.min(Number(query.limit) || 20, 100)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (query.status) {
      conditions.push(`ags.status = $${idx++}`)
      params.push(query.status)
    }

    if (query.templateId) {
      conditions.push(`ags.template_id = $${idx++}`)
      params.push(query.templateId)
    }

    if (query.clientId) {
      conditions.push(`ags.client_id = $${idx++}`)
      params.push(query.clientId)
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    params.push(limit)

    const sessions = await queryRows(`
      SELECT
        ags.id,
        ags.project_name,
        ags.project_description,
        ags.status,
        ags.target_budget,
        ags.target_deadline,
        ags.ai_tokens_used,
        ags.created_by,
        tm.name AS created_by_name,
        ags.template_id,
        pt.name AS template_name,
        ags.client_id,
        c.name AS client_name,
        ags.created_project_id,
        p.name AS created_project_name,
        ags.applied_by,
        applier.name AS applied_by_name,
        ags.applied_at,
        ags.created_at,
        ags.completed_at,
        ags.error_message
      FROM ai_generation_sessions ags
      LEFT JOIN team_members tm ON ags.created_by = tm.id
      LEFT JOIN project_templates pt ON ags.template_id = pt.id
      LEFT JOIN agency_clients c ON ags.client_id = c.id
      LEFT JOIN projects p ON ags.created_project_id = p.id
      LEFT JOIN team_members applier ON ags.applied_by = applier.id
      ${whereClause}
      ORDER BY ags.created_at DESC
      LIMIT $${idx}
    `, params)

    // Summary stats
    const byStatus = new Map<string, number>()
    for (const s of sessions) {
      const count = byStatus.get(s.status) || 0
      byStatus.set(s.status, count + 1)
    }

    return {
      sessions: sessions.map(s => ({
        id: s.id,
        projectName: s.project_name,
        projectDescription: s.project_description,
        status: s.status,
        targetBudget: s.target_budget,
        targetDeadline: s.target_deadline,
        tokensUsed: s.ai_tokens_used,
        createdBy: {
          id: s.created_by,
          name: s.created_by_name
        },
        template: s.template_id ? {
          id: s.template_id,
          name: s.template_name
        } : null,
        client: s.client_id ? {
          id: s.client_id,
          name: s.client_name
        } : null,
        createdProject: s.created_project_id ? {
          id: s.created_project_id,
          name: s.created_project_name
        } : null,
        appliedBy: s.applied_by ? {
          id: s.applied_by,
          name: s.applied_by_name
        } : null,
        appliedAt: s.applied_at,
        createdAt: s.created_at,
        completedAt: s.completed_at,
        errorMessage: s.error_message
      })),
      summary: {
        total: sessions.length,
        byStatus: Object.fromEntries(byStatus)
      }
    }
  } catch (error) {
    console.error('Failed to fetch AI generation sessions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch AI generation sessions'
    })
  }
})
