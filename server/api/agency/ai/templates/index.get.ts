/**
 * List Project Templates
 * GET /api/agency/ai/templates
 *
 * Query params:
 * - category: Filter by category
 * - isActive: Filter by active status
 * - search: Search by name/description
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (query.category) {
      conditions.push(`pt.category = $${idx++}`)
      params.push(query.category)
    }

    if (query.isActive !== undefined) {
      conditions.push(`pt.is_active = $${idx++}`)
      params.push(query.isActive === 'true')
    } else {
      // Default to active only
      conditions.push('pt.is_active = true')
    }

    if (query.search) {
      conditions.push(`(pt.name ILIKE $${idx} OR pt.description ILIKE $${idx})`)
      params.push(`%${query.search}%`)
      idx++
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    const templates = await queryRows(`
      SELECT
        pt.id,
        pt.name,
        pt.description,
        pt.category,
        pt.default_project_type,
        pt.estimated_duration_days,
        pt.estimated_budget_min,
        pt.estimated_budget_max,
        pt.phases,
        pt.default_tasks,
        pt.required_skills,
        pt.recommended_team_size,
        pt.discovery_questions,
        pt.is_active,
        pt.is_system,
        pt.created_by,
        tm.name AS created_by_name,
        pt.created_at,
        pt.updated_at,
        (SELECT COUNT(*) FROM ai_generation_sessions ags WHERE ags.template_id = pt.id) AS times_used,
        (SELECT COUNT(*) FROM ai_generation_sessions ags WHERE ags.template_id = pt.id AND ags.status = 'applied') AS projects_created
      FROM project_templates pt
      LEFT JOIN team_members tm ON pt.created_by = tm.id
      ${whereClause}
      ORDER BY pt.is_system DESC, pt.name
    `, params)

    // Group by category
    const byCategory = new Map<string, number>()
    for (const t of templates) {
      if (t.category) {
        const count = byCategory.get(t.category) || 0
        byCategory.set(t.category, count + 1)
      }
    }

    return {
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        defaultProjectType: t.default_project_type,
        estimatedDuration: t.estimated_duration_days,
        estimatedBudget: {
          min: t.estimated_budget_min,
          max: t.estimated_budget_max
        },
        phases: t.phases,
        defaultTasks: t.default_tasks,
        requiredSkills: t.required_skills,
        recommendedTeamSize: t.recommended_team_size,
        discoveryQuestions: t.discovery_questions,
        isActive: t.is_active,
        isSystem: t.is_system,
        stats: {
          timesUsed: Number(t.times_used),
          projectsCreated: Number(t.projects_created)
        },
        createdBy: t.created_by ? {
          id: t.created_by,
          name: t.created_by_name
        } : null,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      })),
      summary: {
        total: templates.length,
        byCategory: Object.fromEntries(byCategory)
      }
    }
  } catch (error) {
    console.error('Failed to fetch project templates:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch project templates'
    })
  }
})
