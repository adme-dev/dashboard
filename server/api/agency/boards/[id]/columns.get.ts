/**
 * Get Board Columns
 * GET /api/agency/boards/:id/columns
 *
 * Reads from custom_columns + column_dropdown_options.
 * Falls back to board_columns for legacy compatibility.
 */

import { createError, getRouterParam, getQuery } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryRows, queryOne } from '../../../../utils/db'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const includeHidden = query.includeHidden === 'true'

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  try {
    // Resolve department
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      return { columns: [] }
    }

    // Try custom_columns first (modern system)
    const customColumns = await queryRows(`
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

  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch columns: ${error.message}`,
    })
  }
})
