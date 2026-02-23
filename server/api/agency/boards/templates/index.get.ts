/**
 * List Board Templates
 * GET /api/agency/boards/templates
 *
 * Query params:
 * - category: Filter by category
 * - search: Search by name/description
 * - limit: Max results (default 50)
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const category = query.category as string | undefined
  const search = query.search as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (category && category !== 'all') {
      conditions.push(`bt.category = $${idx}`)
      params.push(category)
      idx++
    }

    if (search) {
      conditions.push(`(bt.name ILIKE $${idx} OR bt.description ILIKE $${idx})`)
      params.push(`%${search}%`)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit)

    const templates = await queryRows(`
      SELECT
        bt.id,
        bt.name,
        bt.description,
        bt.category,
        bt.icon,
        bt.color,
        bt.columns,
        bt.groups,
        bt.views,
        bt.is_public,
        bt.is_system,
        bt.times_used,
        bt.last_used_at,
        bt.created_at,
        tm.name as created_by_name,
        d.name as source_board_name,
        jsonb_array_length(COALESCE(bt.columns, '[]'::jsonb)) as column_count,
        jsonb_array_length(COALESCE(bt.groups, '[]'::jsonb)) as group_count
      FROM board_templates bt
      LEFT JOIN team_members tm ON bt.created_by = tm.id
      LEFT JOIN departments d ON bt.source_department_id = d.id
      ${whereClause}
      ORDER BY bt.is_system DESC, bt.times_used DESC, bt.name
      LIMIT $${idx}
    `, params)

    const categories = await queryRows(`
      SELECT DISTINCT category
      FROM board_templates
      WHERE category IS NOT NULL
      ORDER BY category
    `)

    return {
      templates: templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        icon: t.icon,
        color: t.color,
        columnCount: Number(t.column_count || 0),
        groupCount: Number(t.group_count || 0),
        isPublic: t.is_public,
        isSystem: t.is_system,
        timesUsed: t.times_used,
        lastUsedAt: t.last_used_at,
        createdAt: t.created_at,
        createdByName: t.created_by_name,
        sourceBoardName: t.source_board_name,
      })),
      categories: categories.map((c: any) => c.category),
    }
  } catch (error) {
    console.error('Failed to fetch board templates:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch board templates',
    })
  }
})
