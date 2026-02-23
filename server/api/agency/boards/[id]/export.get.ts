/**
 * Export Board as CSV
 * GET /api/agency/boards/:id/export
 *
 * Query params:
 * - format: 'csv' (default) — future: 'json'
 * - columns: comma-separated column slugs to include (optional, defaults to all visible)
 */

import { createError, getRouterParam, getQuery, setResponseHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const filterColumns = query.columns ? (query.columns as string).split(',') : null

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  try {
    // Resolve department
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id, name, slug FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id, name, slug FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Board not found' })
    }

    // Get columns
    let columns = await queryRows(`
      SELECT id, name, slug, column_type as "columnType"
      FROM custom_columns
      WHERE department_id = $1 AND is_visible = true
      ORDER BY sort_order, name
    `, [dept.id])

    if (filterColumns) {
      columns = columns.filter((c: any) => filterColumns.includes(c.slug))
    }

    // Get dropdown options for status/dropdown columns
    const optionColumnIds = columns
      .filter((c: any) => c.columnType === 'status' || c.columnType === 'dropdown')
      .map((c: any) => c.id)

    const optionsMap = new Map<string, Map<string, string>>()
    if (optionColumnIds.length > 0) {
      const options = await queryRows(`
        SELECT column_id, value, label
        FROM column_dropdown_options
        WHERE column_id = ANY($1)
      `, [optionColumnIds])
      for (const opt of options) {
        if (!optionsMap.has(opt.column_id)) optionsMap.set(opt.column_id, new Map())
        optionsMap.get(opt.column_id)!.set(opt.value, opt.label)
      }
    }

    // Get tasks with basic fields
    const tasks = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.due_date,
        t.priority,
        t.created_at,
        ts.name as status_name,
        tm.name as assignee_name,
        bg.name as group_name,
        p.name as project_name
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      LEFT JOIN board_groups bg ON t.group_id = bg.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.department_id = $1
        AND t.parent_task_id IS NULL
      ORDER BY bg.sort_order NULLS LAST, t.sort_order, t.created_at
    `, [dept.id])

    // Get column values for all tasks
    const taskIds = tasks.map((t: any) => t.id)
    const columnValuesMap = new Map<string, Map<string, any>>()

    if (taskIds.length > 0 && columns.length > 0) {
      const values = await queryRows(`
        SELECT
          tcv.task_id,
          tcv.column_id,
          tcv.text_value,
          tcv.number_value,
          tcv.date_value,
          tcv.date_end_value,
          tcv.json_value
        FROM task_column_values tcv
        WHERE tcv.task_id = ANY($1)
          AND tcv.column_id = ANY($2)
      `, [taskIds, columns.map((c: any) => c.id)])

      for (const v of values) {
        if (!columnValuesMap.has(v.task_id)) columnValuesMap.set(v.task_id, new Map())
        columnValuesMap.get(v.task_id)!.set(v.column_id, v)
      }
    }

    // Build CSV
    const headers = ['Group', 'Title', 'Status', 'Priority', 'Assignee', 'Due Date', 'Project']
    for (const col of columns) {
      headers.push(col.name)
    }

    const rows: string[][] = [headers]

    for (const task of tasks) {
      const row: string[] = [
        task.group_name || '',
        task.title || '',
        task.status_name || '',
        task.priority || '',
        task.assignee_name || '',
        task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '',
        task.project_name || '',
      ]

      // Add custom column values
      for (const col of columns) {
        const cv = columnValuesMap.get(task.id)?.get(col.id)
        row.push(formatCellValueForCSV(cv, col, optionsMap.get(col.id)))
      }

      rows.push(row)
    }

    const csv = rows.map(row =>
      row.map(cell => {
        const escaped = String(cell).replace(/"/g, '""')
        return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
          ? `"${escaped}"`
          : escaped
      }).join(',')
    ).join('\n')

    const filename = `${dept.slug || dept.name.toLowerCase().replace(/\s+/g, '-')}-export-${new Date().toISOString().split('T')[0]}.csv`

    setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)

    return csv
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to export board:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to export board',
    })
  }
})

function formatCellValueForCSV(
  cv: any | undefined,
  col: any,
  optionLookup?: Map<string, string>
): string {
  if (!cv) return ''

  switch (col.columnType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'link':
    case 'color':
      return cv.text_value || ''

    case 'number':
    case 'currency':
    case 'rating':
    case 'progress':
      return cv.number_value != null ? String(cv.number_value) : ''

    case 'checkbox':
      return cv.number_value ? 'Yes' : 'No'

    case 'date':
      return cv.date_value ? new Date(cv.date_value).toISOString().split('T')[0] : ''

    case 'timeline':
      if (cv.date_value && cv.date_end_value) {
        const start = new Date(cv.date_value).toISOString().split('T')[0]
        const end = new Date(cv.date_end_value).toISOString().split('T')[0]
        return `${start} - ${end}`
      }
      return cv.date_value ? new Date(cv.date_value).toISOString().split('T')[0] : ''

    case 'status':
    case 'dropdown': {
      if (!cv.json_value) return ''
      const json = typeof cv.json_value === 'string' ? JSON.parse(cv.json_value) : cv.json_value
      if (Array.isArray(json)) {
        return json.map((id: string) => optionLookup?.get(id) || id).join('; ')
      }
      return optionLookup?.get(json) || String(json)
    }

    case 'people': {
      if (!cv.json_value) return ''
      const json = typeof cv.json_value === 'string' ? JSON.parse(cv.json_value) : cv.json_value
      if (Array.isArray(json)) return json.join('; ')
      return String(json)
    }

    case 'tags':
    case 'dependency': {
      if (!cv.json_value) return ''
      const json = typeof cv.json_value === 'string' ? JSON.parse(cv.json_value) : cv.json_value
      if (Array.isArray(json)) return json.join('; ')
      return String(json)
    }

    default:
      return cv.text_value || (cv.json_value ? JSON.stringify(cv.json_value) : '')
  }
}
