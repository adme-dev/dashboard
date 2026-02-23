/**
 * Import CSV into Board
 * POST /api/agency/boards/:id/import
 *
 * Body:
 * - csv: Raw CSV string (required)
 * - columnMapping: Record<csvHeader, columnSlug> — maps CSV headers to board columns
 * - groupId: Default group ID for imported tasks (optional)
 * - statusId: Default status ID for imported tasks (optional)
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const { csv, columnMapping, groupId, statusId } = body

  if (!csv || typeof csv !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'CSV data is required' })
  }

  try {
    // Resolve department
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Board not found' })
    }

    // Get default status if none provided
    let defaultStatusId = statusId
    if (!defaultStatusId) {
      const status = await queryOne(
        "SELECT id FROM task_statuses WHERE (department_id = $1 OR department_id IS NULL) AND category = 'not_started' ORDER BY department_id NULLS LAST LIMIT 1",
        [dept.id]
      )
      defaultStatusId = status?.id
    }

    if (!defaultStatusId) {
      throw createError({ statusCode: 400, statusMessage: 'No default status found. Please provide a statusId.' })
    }

    // Parse CSV
    const rows = parseCSV(csv)
    if (rows.length < 2) {
      throw createError({ statusCode: 400, statusMessage: 'CSV must have at least a header row and one data row' })
    }

    const headers = rows[0]
    const dataRows = rows.slice(1).filter(row => row.some(cell => cell.trim()))

    // Load board columns for mapping
    const boardColumns = await queryRows(`
      SELECT id, name, slug, column_type as "columnType"
      FROM custom_columns
      WHERE department_id = $1
    `, [dept.id])

    const columnBySlug = new Map(boardColumns.map((c: any) => [c.slug, c]))
    const columnByName = new Map(boardColumns.map((c: any) => [c.name.toLowerCase(), c]))

    // Build header-to-column mapping
    const mapping = columnMapping || {}
    const resolvedMapping: Record<number, { column: any; headerName: string }> = {}
    let titleIndex = -1
    let groupIndex = -1

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].trim()
      const headerLower = header.toLowerCase()

      // Check explicit mapping first
      if (mapping[header]) {
        const col = columnBySlug.get(mapping[header])
        if (col) resolvedMapping[i] = { column: col, headerName: header }
      }

      // Auto-detect built-in fields
      if (headerLower === 'title' || headerLower === 'name' || headerLower === 'task') {
        titleIndex = i
      } else if (headerLower === 'group') {
        groupIndex = i
      } else if (!mapping[header]) {
        // Try matching by column name or slug
        const col = columnBySlug.get(headerLower) || columnByName.get(headerLower)
        if (col) resolvedMapping[i] = { column: col, headerName: header }
      }
    }

    if (titleIndex === -1) {
      // Use first column as title
      titleIndex = 0
    }

    // Load existing groups for group name lookup
    const existingGroups = await queryRows(
      'SELECT id, name FROM board_groups WHERE department_id = $1',
      [dept.id]
    )
    const groupByName = new Map(existingGroups.map((g: any) => [g.name.toLowerCase(), g.id]))

    let importedCount = 0
    let skippedCount = 0

    await transaction(async (client) => {
      for (const row of dataRows) {
        const title = row[titleIndex]?.trim()
        if (!title) {
          skippedCount++
          continue
        }

        // Resolve group
        let taskGroupId = groupId || null
        if (groupIndex >= 0 && row[groupIndex]?.trim()) {
          const groupName = row[groupIndex].trim().toLowerCase()
          taskGroupId = groupByName.get(groupName) || groupId || null
        }

        // Create task
        const taskResult = await client.query(`
          INSERT INTO tasks (
            department_id, title, status_id, group_id,
            sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          RETURNING id
        `, [dept.id, title, defaultStatusId, taskGroupId, importedCount])

        const taskId = taskResult.rows[0].id

        // Set column values
        for (const [idxStr, { column }] of Object.entries(resolvedMapping)) {
          const idx = Number(idxStr)
          const cellValue = row[idx]?.trim()
          if (!cellValue) continue

          const { textValue, numberValue, dateValue, dateEndValue, jsonValue } =
            parseCellValue(cellValue, column.columnType)

          if (textValue != null || numberValue != null || dateValue != null || jsonValue != null) {
            await client.query(`
              INSERT INTO task_column_values (task_id, column_id, text_value, number_value, date_value, date_end_value, json_value)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (task_id, column_id) DO UPDATE SET
                text_value = COALESCE($3, task_column_values.text_value),
                number_value = COALESCE($4, task_column_values.number_value),
                date_value = COALESCE($5, task_column_values.date_value),
                date_end_value = COALESCE($6, task_column_values.date_end_value),
                json_value = COALESCE($7, task_column_values.json_value),
                updated_at = NOW()
            `, [taskId, column.id, textValue, numberValue, dateValue, dateEndValue, jsonValue ? JSON.stringify(jsonValue) : null])
          }
        }

        importedCount++
      }
    })

    return {
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      total: dataRows.length,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to import CSV:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to import CSV',
    })
  }
})

/**
 * Simple CSV parser handling quoted fields
 */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          currentField += '"'
          i++ // Skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        currentField += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        currentRow.push(currentField)
        currentField = ''
      } else if (ch === '\n' || (ch === '\r' && csv[i + 1] === '\n')) {
        currentRow.push(currentField)
        currentField = ''
        rows.push(currentRow)
        currentRow = []
        if (ch === '\r') i++ // Skip \n in \r\n
      } else {
        currentField += ch
      }
    }
  }

  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  return rows
}

/**
 * Parse a CSV cell value into the appropriate column value fields
 */
function parseCellValue(value: string, columnType: string): {
  textValue: string | null
  numberValue: number | null
  dateValue: string | null
  dateEndValue: string | null
  jsonValue: any | null
} {
  const result = { textValue: null as string | null, numberValue: null as number | null, dateValue: null as string | null, dateEndValue: null as string | null, jsonValue: null as any | null }

  switch (columnType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'link':
    case 'color':
      result.textValue = value
      break

    case 'number':
    case 'currency':
    case 'rating':
    case 'progress': {
      const num = Number(value.replace(/[^0-9.-]/g, ''))
      if (!isNaN(num)) result.numberValue = num
      break
    }

    case 'checkbox':
      result.numberValue = ['yes', 'true', '1', 'x'].includes(value.toLowerCase()) ? 1 : 0
      break

    case 'date': {
      const d = new Date(value)
      if (!isNaN(d.getTime())) result.dateValue = d.toISOString().split('T')[0]
      break
    }

    case 'timeline': {
      // Expect "start - end" format
      const parts = value.split(/\s*[-–]\s*/)
      if (parts.length >= 2) {
        const start = new Date(parts[0].trim())
        const end = new Date(parts[1].trim())
        if (!isNaN(start.getTime())) result.dateValue = start.toISOString().split('T')[0]
        if (!isNaN(end.getTime())) result.dateEndValue = end.toISOString().split('T')[0]
      } else {
        const d = new Date(value)
        if (!isNaN(d.getTime())) result.dateValue = d.toISOString().split('T')[0]
      }
      break
    }

    case 'status':
    case 'dropdown':
      // Store as text — caller should resolve to option ID
      result.textValue = value
      break

    case 'people':
    case 'tags':
    case 'dependency': {
      const items = value.split(/[;,]/).map(s => s.trim()).filter(Boolean)
      result.jsonValue = items
      break
    }

    default:
      result.textValue = value
  }

  return result
}
