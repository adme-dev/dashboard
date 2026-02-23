/**
 * Create Board Template from existing board
 * POST /api/agency/boards/templates
 *
 * Body:
 * - name: Template name (required)
 * - description: Template description
 * - category: Template category
 * - icon: Icon name
 * - color: Hex color
 * - sourceBoardId: Board/department ID to snapshot (required)
 * - isPublic: Whether template is visible to all (default true)
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { name, description, category, icon, color, sourceBoardId, isPublic = true } = body

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Template name is required' })
  }

  if (!sourceBoardId) {
    throw createError({ statusCode: 400, statusMessage: 'Source board ID is required' })
  }

  try {
    // Resolve department
    const dept = isUUID(sourceBoardId)
      ? await queryOne('SELECT id, name FROM departments WHERE id = $1::uuid', [sourceBoardId])
      : await queryOne('SELECT id, name FROM departments WHERE slug = $1', [sourceBoardId])

    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Source board not found' })
    }

    // Snapshot columns
    const columns = await queryRows(`
      SELECT
        cc.name,
        cc.slug,
        cc.column_type,
        cc.description,
        cc.settings,
        cc.is_visible,
        cc.is_required,
        cc.width,
        cc.sort_order
      FROM custom_columns cc
      WHERE cc.department_id = $1
      ORDER BY cc.sort_order, cc.name
    `, [dept.id])

    // Snapshot dropdown options for each column
    const columnIds = (await queryRows(
      'SELECT id, slug FROM custom_columns WHERE department_id = $1',
      [dept.id]
    ))
    const columnIdToSlug = new Map(columnIds.map((c: any) => [c.id, c.slug]))

    const allOptions = columnIds.length > 0
      ? await queryRows(`
        SELECT column_id, value, label, color, sort_order, is_default
        FROM column_dropdown_options
        WHERE column_id = ANY($1)
        ORDER BY sort_order
      `, [columnIds.map((c: any) => c.id)])
      : []

    // Attach options to columns by slug
    const optionsBySlug = new Map<string, any[]>()
    for (const opt of allOptions) {
      const slug = columnIdToSlug.get(opt.column_id)
      if (slug) {
        if (!optionsBySlug.has(slug)) optionsBySlug.set(slug, [])
        optionsBySlug.get(slug)!.push({
          value: opt.value,
          label: opt.label,
          color: opt.color,
          sortOrder: opt.sort_order,
          isDefault: opt.is_default,
        })
      }
    }

    const columnsSnapshot = columns.map((c: any) => ({
      name: c.name,
      slug: c.slug,
      columnType: c.column_type,
      description: c.description,
      settings: c.settings,
      isVisible: c.is_visible,
      isRequired: c.is_required,
      width: c.width,
      sortOrder: c.sort_order,
      options: optionsBySlug.get(c.slug) || [],
    }))

    // Snapshot groups
    const groups = await queryRows(`
      SELECT name, color, sort_order
      FROM board_groups
      WHERE department_id = $1
      ORDER BY sort_order
    `, [dept.id])

    const groupsSnapshot = groups.map((g: any) => ({
      name: g.name,
      color: g.color,
      sortOrder: g.sort_order,
    }))

    // Snapshot views
    const views = await queryRows(`
      SELECT name, view_type, is_default, config, sort_order
      FROM board_views
      WHERE department_id = $1
      ORDER BY sort_order
    `, [dept.id])

    const viewsSnapshot = views.map((v: any) => ({
      name: v.name,
      viewType: v.view_type,
      isDefault: v.is_default,
      config: v.config,
      sortOrder: v.sort_order,
    }))

    // Insert template
    const template = await queryOne(`
      INSERT INTO board_templates (
        name, description, category, icon, color,
        columns, groups, views,
        source_department_id, is_public, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      name,
      description || null,
      category || null,
      icon || 'layout-grid',
      color || '#579BFC',
      JSON.stringify(columnsSnapshot),
      JSON.stringify(groupsSnapshot),
      JSON.stringify(viewsSnapshot),
      dept.id,
      isPublic,
      user.id,
    ])

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      columnCount: columnsSnapshot.length,
      groupCount: groupsSnapshot.length,
      sourceBoardName: dept.name,
      createdAt: template.created_at,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create board template:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create board template',
    })
  }
})
