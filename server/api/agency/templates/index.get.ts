/**
 * List Project Templates
 * GET /api/agency/templates
 *
 * Query params:
 * - category: Filter by category
 * - search: Search by name
 * - limit: Max results (default 50)
 */

import { queryRows } from '~~/server/utils/db'
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
    const params: Array<string | number> = []
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
      WITH filtered_templates AS (
        SELECT
          pt.*,
          ROW_NUMBER() OVER (
            PARTITION BY lower(trim(pt.name)), COALESCE(pt.category, '')
            ORDER BY pt.times_used DESC, pt.created_at DESC, pt.id
          ) as duplicate_rank,
          COUNT(*) OVER (
            PARTITION BY lower(trim(pt.name)), COALESCE(pt.category, '')
          ) as duplicate_count
        FROM project_templates pt
        WHERE ${whereClause}
      )
      SELECT
        ft.id,
        ft.name,
        ft.description,
        ft.category,
        ft.tags,
        ft.default_budget_type,
        ft.default_budget_amount,
        ft.estimated_duration_days,
        ft.estimated_hours,
        ft.is_public,
        ft.times_used,
        ft.last_used_at,
        ft.created_at,
        ft.duplicate_count,
        tm.name as created_by_name,
        d.name as department_name,
        COALESCE(phases.count, 0) as phase_count,
        COALESCE(tasks.count, 0) as task_count
      FROM filtered_templates ft
      LEFT JOIN team_members tm ON ft.created_by = tm.id
      LEFT JOIN departments d ON ft.department_id = d.id
      LEFT JOIN (
        SELECT template_id, COUNT(*) as count
        FROM template_phases
        GROUP BY template_id
      ) phases ON ft.id = phases.template_id
      LEFT JOIN (
        SELECT template_id, COUNT(*) as count
        FROM template_tasks
        GROUP BY template_id
      ) tasks ON ft.id = tasks.template_id
      WHERE duplicate_rank = 1
      ORDER BY ft.times_used DESC, ft.name
      LIMIT $${idx}
    `, params)

    // Get categories for filter
    const categories = await queryRows(`
      SELECT DISTINCT category
      FROM project_templates
      WHERE is_active = true AND category IS NOT NULL
      ORDER BY category
    `)

    const hiddenDuplicateCount = templates.reduce((sum, t) => {
      return sum + Math.max(Number(t.duplicate_count || 1) - 1, 0)
    }, 0)

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
        taskCount: Number(t.task_count || 0),
        duplicateCount: Number(t.duplicate_count || 1)
      })),
      categories: categories.map(c => c.category),
      total: templates.length,
      hiddenDuplicateCount
    }
  } catch (error) {
    console.error('Failed to fetch templates:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch templates'
    })
  }
})
