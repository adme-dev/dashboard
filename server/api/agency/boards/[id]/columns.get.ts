/**
 * Get Board Columns
 * GET /api/agency/boards/:id/columns
 *
 * Reads from custom_columns + column_dropdown_options.
 * Falls back to board_columns for legacy compatibility.
 * Auto-seeds default columns (Status, Assignee, Priority) if none exist.
 */

import { createError, getRouterParam, getQuery } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryRows, queryOne, execute } from '../../../../utils/db'
import { cachedFetch } from '~~/server/utils/kv'
import { setCacheHeaders } from '~~/server/utils/cacheHeaders'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

/**
 * Seed default columns for a board that has none.
 * Creates: Status, Assignee (people), Priority (dropdown with options).
 */
async function seedDefaultColumns(departmentId: string, userId: string) {
  const defaults = [
    { name: 'Status', slug: 'status', type: 'status', sortOrder: 1, settings: {} },
    { name: 'Assignee', slug: 'assignee', type: 'people', sortOrder: 2, settings: {} },
    { name: 'Client', slug: 'client', type: 'client', sortOrder: 3, settings: {} },
    { name: 'Priority', slug: 'priority', type: 'dropdown', sortOrder: 4, settings: {} },
    { name: 'Due Date', slug: 'due_date', type: 'date', sortOrder: 5, settings: {} },
  ]

  for (const col of defaults) {
    const created = await queryOne(`
      INSERT INTO custom_columns (department_id, name, slug, column_type, settings, sort_order, created_by)
      VALUES ($1, $2, $3, $4::column_type, $5, $6, $7)
      ON CONFLICT (department_id, slug) DO NOTHING
      RETURNING id
    `, [departmentId, col.name, col.slug, col.type, JSON.stringify(col.settings), col.sortOrder, userId])

    // Seed priority dropdown options
    if (col.slug === 'priority' && created?.id) {
      const priorityOptions = [
        { value: 'critical', label: 'Critical', color: '#E2445C', sortOrder: 1 },
        { value: 'high', label: 'High', color: '#FDAB3D', sortOrder: 2 },
        { value: 'medium', label: 'Medium', color: '#579BFC', sortOrder: 3 },
        { value: 'low', label: 'Low', color: '#C4C4C4', sortOrder: 4 },
      ]
      for (const opt of priorityOptions) {
        await execute(`
          INSERT INTO column_dropdown_options (column_id, value, label, color, sort_order)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (column_id, value) DO NOTHING
        `, [created.id, opt.value, opt.label, opt.color, opt.sortOrder])
      }
    }
  }
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const includeHidden = query.includeHidden === 'true'

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  setCacheHeaders(event, 120, 300)

  const cacheKey = `board:${boardId}:columns${includeHidden ? ':all' : ''}`

  try {
    return await cachedFetch(event, cacheKey, 120, async () => {
    // Resolve department
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      return { columns: [] }
    }

    // Try custom_columns first (modern system)
    let customColumns = await queryRows(`
      SELECT
        cc.id,
        cc.name,
        cc.slug,
        cc.column_type as "columnType",
        cc.description,
        cc.settings,
        cc.is_visible as "isVisible",
        cc.is_required as "isRequired",
        cc.allowed_roles as "allowedRoles",
        cc.editable_roles as "editableRoles",
        cc.width,
        cc.sort_order as "sortOrder"
      FROM custom_columns cc
      WHERE cc.department_id = $1
        ${includeHidden ? '' : 'AND cc.is_visible = true'}
      ORDER BY cc.sort_order, cc.name
    `, [dept.id])

    // Auto-seed default columns if board is missing any defaults
    // Uses ON CONFLICT DO NOTHING so it's safe to run every time
    const defaultSlugs = ['status', 'assignee', 'client', 'priority', 'due_date']
    const existingSlugs = new Set(customColumns.map((c: any) => c.slug))
    const missingDefaults = defaultSlugs.some(s => !existingSlugs.has(s))

    if (missingDefaults) {
      let hasLegacy = false
      if (customColumns.length === 0) {
        try {
          const legacyCount = await queryOne(
            'SELECT COUNT(*)::int as count FROM board_columns WHERE department_id = $1',
            [dept.id]
          )
          hasLegacy = (legacyCount?.count || 0) > 0
        } catch {
          // board_columns table may not exist — treat as no legacy columns
        }
      }
      if (!hasLegacy) {
        await seedDefaultColumns(dept.id, user.id)
        // Re-fetch after seeding
        customColumns = await queryRows(`
          SELECT
            cc.id,
            cc.name,
            cc.slug,
            cc.column_type as "columnType",
            cc.description,
            cc.settings,
            cc.is_visible as "isVisible",
            cc.is_required as "isRequired",
            cc.allowed_roles as "allowedRoles",
            cc.editable_roles as "editableRoles",
            cc.width,
            cc.sort_order as "sortOrder"
          FROM custom_columns cc
          WHERE cc.department_id = $1
          ORDER BY cc.sort_order, cc.name
        `, [dept.id])
      }
    }

    if (customColumns.length > 0) {
      // Fetch dropdown options for all columns
      const columnIds = customColumns.map((c: any) => c.id)
      const options = await queryRows(`
        SELECT
          id,
          column_id as "columnId",
          value,
          label,
          color,
          sort_order as "sortOrder",
          is_default as "isDefault"
        FROM column_dropdown_options
        WHERE column_id = ANY($1)
        ORDER BY sort_order
      `, [columnIds])

      // Group options by column
      const optionsByColumn = new Map<string, any[]>()
      for (const opt of options) {
        if (!optionsByColumn.has(opt.columnId)) {
          optionsByColumn.set(opt.columnId, [])
        }
        optionsByColumn.get(opt.columnId)!.push(opt)
      }

      // Attach options to columns
      const columns = customColumns.map((col: any) => ({
        ...col,
        // Map columnType to type for backward compat with frontend
        type: col.columnType,
        settings: {
          ...(col.settings || {}),
          options: optionsByColumn.get(col.id) || [],
        },
      }))

      return { columns }
    }

    // Fallback to legacy board_columns
    const legacyColumns = await queryRows(`
      SELECT
        bc.id,
        bc.name,
        bc.slug,
        bc.type,
        bc.type as "columnType",
        bc.settings,
        bc.sort_order as "sortOrder",
        bc.is_visible as "isVisible"
      FROM board_columns bc
      WHERE bc.department_id = $1
      ORDER BY bc.sort_order, bc.name
    `, [dept.id])

    // Map legacy types to modern types for frontend compatibility
    const typeMap: Record<string, string> = { label: 'status', numbers: 'number' }
    const mappedColumns = legacyColumns.map((col: any) => ({
      ...col,
      type: typeMap[col.type] || col.type,
      columnType: typeMap[col.columnType] || col.columnType,
    }))

    return { columns: mappedColumns }
    }) // end cachedFetch

  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch columns: ${error.message}`,
    })
  }
})
