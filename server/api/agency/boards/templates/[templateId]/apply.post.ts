/**
 * Apply Board Template to a department/board
 * POST /api/agency/boards/templates/:templateId/apply
 *
 * Body:
 * - departmentId: Target department (required)
 * - includeColumns: Whether to create columns (default true)
 * - includeGroups: Whether to create groups (default true)
 * - includeViews: Whether to create views (default true)
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const templateId = getRouterParam(event, 'templateId')
  const body = await readBody(event)

  if (!templateId) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const { departmentId, includeColumns = true, includeGroups = true, includeViews = true } = body

  if (!departmentId) {
    throw createError({ statusCode: 400, statusMessage: 'Department ID is required' })
  }

  try {
    // Load template
    const template = await queryOne(
      'SELECT * FROM board_templates WHERE id = $1',
      [templateId]
    )
    if (!template) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    // Verify target department exists
    const dept = await queryOne('SELECT id, name FROM departments WHERE id = $1', [departmentId])
    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Target department not found' })
    }

    const columns = template.columns || []
    const groups = template.groups || []
    const views = template.views || []

    let createdColumns = 0
    let createdGroups = 0
    let createdViews = 0

    await transaction(async (client) => {
      // Create columns
      if (includeColumns && columns.length > 0) {
        for (const col of columns) {
          const result = await client.query(`
            INSERT INTO custom_columns (
              department_id, name, slug, column_type, description,
              settings, is_visible, is_required, width, sort_order, created_by
            ) VALUES ($1, $2, $3, $4::column_type, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (department_id, slug) DO NOTHING
            RETURNING id
          `, [
            departmentId,
            col.name,
            col.slug,
            col.columnType,
            col.description || null,
            JSON.stringify(col.settings || {}),
            col.isVisible ?? true,
            col.isRequired ?? false,
            col.width || 150,
            col.sortOrder || 0,
            user.id,
          ])

          if (result.rows.length > 0 && col.options?.length > 0) {
            const columnId = result.rows[0].id
            for (const opt of col.options) {
              await client.query(`
                INSERT INTO column_dropdown_options (
                  column_id, value, label, color, sort_order, is_default
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (column_id, value) DO NOTHING
              `, [columnId, opt.value, opt.label, opt.color || '#6B7280', opt.sortOrder || 0, opt.isDefault || false])
            }
            createdColumns++
          } else if (result.rows.length > 0) {
            createdColumns++
          }
        }
      }

      // Create groups
      if (includeGroups && groups.length > 0) {
        for (const grp of groups) {
          await client.query(`
            INSERT INTO board_groups (department_id, name, color, sort_order)
            VALUES ($1, $2, $3, $4)
          `, [departmentId, grp.name, grp.color || '#579BFC', grp.sortOrder || 0])
          createdGroups++
        }
      }

      // Create views
      if (includeViews && views.length > 0) {
        for (const view of views) {
          await client.query(`
            INSERT INTO board_views (
              department_id, name, view_type, is_default, config, sort_order, created_by
            ) VALUES ($1, $2, $3::board_view_type, $4, $5, $6, $7)
          `, [
            departmentId,
            view.name,
            view.viewType,
            view.isDefault || false,
            JSON.stringify(view.config || {}),
            view.sortOrder || 0,
            user.id,
          ])
          createdViews++
        }
      }

      // Increment usage counter
      await client.query(`
        UPDATE board_templates
        SET times_used = times_used + 1, last_used_at = NOW()
        WHERE id = $1
      `, [templateId])
    })

    return {
      success: true,
      templateName: template.name,
      departmentName: dept.name,
      created: {
        columns: createdColumns,
        groups: createdGroups,
        views: createdViews,
      },
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to apply board template:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to apply board template',
    })
  }
})
