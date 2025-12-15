/**
 * List Project Templates
 * GET /api/agency/templates
 *
 * Query params:
 * - category: Filter by category
 * - search: Search by name
 * - limit: Max results (default 50)
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const category = query.category as string | undefined
  const search = query.search as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    // Build query conditions
    const conditions: string[] = ['pt.is_active = true']
    const params: any[] = []
    let idx = 1

    if (category && category !== 'all') {
      conditions.push(`pt.category = $${idx}`)
      params.push(category)
      idx++
    }

    if (search) {
      conditions.push(`(pt.name ILIKE $${idx} OR pt.description ILIKE $${idx})`)
      params.push(`%${search}%`)
      idx++
    }

    const whereClause = conditions.join(' AND ')
    params.push(limit)

    const templates = await queryRows(`
      SELECT
        pt.id,
        pt.name,
        pt.description,
        pt.category,
        pt.tags,
        pt.default_budget_type,
        pt.default_budget_amount,
        pt.estimated_duration_days,
        pt.estimated_hours,
        pt.is_public,
        pt.times_used,
        pt.last_used_at,
        pt.created_at,
        tm.name as created_by_name,
        d.name as department_name,
        COALESCE(phases.count, 0) as phase_count,
        COALESCE(tasks.count, 0) as task_count
      FROM project_templates pt
      LEFT JOIN team_members tm ON pt.created_by = tm.id
      LEFT JOIN departments d ON pt.department_id = d.id
      LEFT JOIN (
        SELECT template_id, COUNT(*) as count
        FROM template_phases
        GROUP BY template_id
      ) phases ON pt.id = phases.template_id
      LEFT JOIN (
        SELECT template_id, COUNT(*) as count
        FROM template_tasks
        GROUP BY template_id
      ) tasks ON pt.id = tasks.template_id
      WHERE ${whereClause}
      ORDER BY pt.times_used DESC, pt.name
      LIMIT $${idx}
    `, params)

    // Get categories for filter
    const categories = await queryRows(`
      SELECT DISTINCT category
      FROM project_templates
      WHERE is_active = true AND category IS NOT NULL
      ORDER BY category
    `)

    return {
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        tags: t.tags,
        defaultBudgetType: t.default_budget_type,
        defaultBudgetAmount: Number(t.default_budget_amount || 0),
        estimatedDurationDays: t.estimated_duration_days,
        estimatedHours: Number(t.estimated_hours || 0),
        isPublic: t.is_public,
        timesUsed: t.times_used,
        lastUsedAt: t.last_used_at,
        createdAt: t.created_at,
        createdByName: t.created_by_name,
        departmentName: t.department_name,
        phaseCount: Number(t.phase_count || 0),
        taskCount: Number(t.task_count || 0)
      })),
      categories: categories.map(c => c.category)
    }
  } catch (error) {
    console.error('Failed to fetch templates:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch templates'
    })
  }
})
