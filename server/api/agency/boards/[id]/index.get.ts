/**
 * Get Board Data with Groups and Items
 * GET /api/agency/boards/:id
 *
 * Reads column values from task_column_values + custom_columns.
 * Falls back to task_monday_column_values for legacy boards.
 */

import { createError, getQuery, getRouterParam } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryRows, queryOne } from '../../../../utils/db'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const search = (query.search as string) || ''

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  try {
    const boardInfo = isUUID(boardId)
      ? await queryOne('SELECT id, name, slug FROM departments WHERE id = $1', [boardId])
      : await queryOne('SELECT id, name, slug FROM departments WHERE slug = $1', [boardId])

    if (!boardInfo) {
      return { id: boardId, name: 'Board Not Found', groups: [], totalItems: 0 }
    }

    return await fetchBoardData(boardInfo.id, boardInfo.name, search)
  } catch (error: any) {
    console.error('Failed to fetch board:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch board: ${error.message}`,
    })
  }
})

async function fetchBoardData(departmentId: string, boardName: string, search: string) {
  const params: any[] = [departmentId]
  let searchCondition = ''
  if (search) {
    searchCondition = 'AND t.title ILIKE $2'
    params.push(`%${search}%`)
  }

  // Check if board_groups exist for this department
  const boardGroups = await queryRows(`
    SELECT id, name, color, sort_order, is_collapsed
    FROM board_groups
    WHERE department_id = $1
    ORDER BY sort_order, created_at
  `, [departmentId])

  // Get tasks with joins (include group_id for board_groups assignment)
  const items = await queryRows(`
    SELECT
      t.id,
      t.title,
      t.description,
      t.due_date,
      t.priority,
      t.status_id,
      t.group_id,
      t.parent_task_id,
      t.created_at,
      t.updated_at,
      ts.name as status_name,
      ts.color as status_color,
      ts.category as status_category,
      tm.id as assignee_id,
      tm.name as assignee_name,
      tm.avatar_url as assignee_avatar,
      p.id as project_id,
      p.name as project_name,
      ac.name as client_name,
      mim.source_data->'group'->>'title' as monday_group_title,
      mim.source_data->'group'->>'id' as monday_group_id
    FROM tasks t
    LEFT JOIN monday_item_mappings mim ON mim.task_id = t.id
    LEFT JOIN task_statuses ts ON t.status_id = ts.id
    LEFT JOIN team_members tm ON t.assignee_id = tm.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN agency_clients ac ON p.client_id = ac.id
    WHERE t.department_id = $1
      AND t.parent_task_id IS NULL
    ${searchCondition}
    ORDER BY t.sort_order, t.updated_at DESC
  `, params)

  const taskIds = items.map((i: any) => i.id)

  // Load column values from custom_columns system (preferred)
  let columnValuesMap = new Map<string, any[]>()

  if (taskIds.length > 0) {
    // Try modern task_column_values first
    const customValues = await queryRows(`
      SELECT
        tcv.task_id,
        tcv.column_id,
        cc.slug as column_slug,
        cc.column_type,
        cc.name as column_name,
        tcv.text_value,
        tcv.number_value,
        tcv.date_value,
        tcv.date_end_value,
        tcv.json_value
      FROM task_column_values tcv
      JOIN custom_columns cc ON cc.id = tcv.column_id
      WHERE tcv.task_id = ANY($1)
    `, [taskIds])

    if (customValues.length > 0) {
      for (const cv of customValues) {
        if (!columnValuesMap.has(cv.task_id)) {
          columnValuesMap.set(cv.task_id, [])
        }
        columnValuesMap.get(cv.task_id)!.push({
          columnId: cv.column_id,
          columnSlug: cv.column_slug,
          columnType: cv.column_type,
          columnName: cv.column_name,
          textValue: cv.text_value,
          numberValue: cv.number_value,
          dateValue: cv.date_value,
          dateEndValue: cv.date_end_value,
          jsonValue: cv.json_value,
        })
      }
    } else {
      // Fallback to legacy Monday column values
      const legacyValues = await queryRows(`
        SELECT
          task_id,
          monday_column_id,
          column_title,
          column_type,
          text_value,
          value_json
        FROM task_monday_column_values
        WHERE task_id = ANY($1)
      `, [taskIds])

      for (const cv of legacyValues) {
        if (!columnValuesMap.has(cv.task_id)) {
          columnValuesMap.set(cv.task_id, [])
        }
        columnValuesMap.get(cv.task_id)!.push(cv)
      }
    }
  }

  // Use board_groups if they exist, otherwise fall back to legacy grouping
  const groups = boardGroups.length > 0
    ? groupItemsByBoardGroups(items, columnValuesMap, boardGroups)
    : groupItemsByLegacy(items, columnValuesMap)

  const totalItems = items.length
  const lastUpdated = items.length > 0 ? items[0].updated_at : new Date()

  return {
    id: departmentId,
    name: boardName,
    groups,
    totalItems,
    lastUpdated: lastUpdated instanceof Date ? lastUpdated.toISOString() : lastUpdated,
    hasBoardGroups: boardGroups.length > 0,
  }
}

function buildItemPayload(item: any, columnValuesMap: Map<string, any[]>) {
  const columnValues = columnValuesMap.get(item.id) || []
  const columnValuesObj: Record<string, any> = {}
  for (const cv of columnValues) {
    const slug = cv.columnSlug || cv.column_title || cv.monday_column_id
    if (slug) {
      columnValuesObj[slug] = cv
    }
  }

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    dueDate: item.due_date,
    priority: item.priority,
    status: item.status_name || 'Unknown',
    statusColor: item.status_color || getStatusColor(item.status_category),
    groupId: item.group_id || null,
    assignees: item.assignee_id
      ? [{ id: item.assignee_id, name: item.assignee_name, avatar: item.assignee_avatar }]
      : [],
    clients: item.client_name ? [item.client_name] : [],
    updatedAt: item.updated_at,
    columnValues: columnValuesObj,
    columnValuesArray: columnValues,
  }
}

/**
 * Group items using board_groups table (modern).
 * Tasks with group_id go into their assigned group.
 * Tasks without group_id go into an "Ungrouped" bucket.
 */
function groupItemsByBoardGroups(items: any[], columnValuesMap: Map<string, any[]>, boardGroups: any[]) {
  const groupMap = new Map<string, { id: string; name: string; color: string; isCollapsed: boolean; sortOrder: number; items: any[] }>()

  // Initialize all board groups (even empty ones)
  for (const bg of boardGroups) {
    groupMap.set(bg.id, {
      id: bg.id,
      name: bg.name,
      color: bg.color || '#579BFC',
      isCollapsed: bg.is_collapsed || false,
      sortOrder: bg.sort_order ?? 0,
      items: [],
    })
  }

  // Assign items to groups
  const ungroupedItems: any[] = []
  for (const item of items) {
    const payload = buildItemPayload(item, columnValuesMap)
    if (item.group_id && groupMap.has(item.group_id)) {
      groupMap.get(item.group_id)!.items.push(payload)
    } else {
      ungroupedItems.push(payload)
    }
  }

  // Sort groups by sortOrder
  const sorted = Array.from(groupMap.values()).sort((a, b) => a.sortOrder - b.sortOrder)

  // Add ungrouped items as a virtual group if any exist
  if (ungroupedItems.length > 0) {
    sorted.push({
      id: '__ungrouped__',
      name: 'Ungrouped',
      color: '#C4C4C4',
      isCollapsed: false,
      sortOrder: 9999,
      items: ungroupedItems,
    })
  }

  return sorted.map((g) => ({ ...g, isExpanded: !g.isCollapsed }))
}

/**
 * Legacy grouping: uses Monday migration data or status category fallback.
 */
function groupItemsByLegacy(items: any[], columnValuesMap: Map<string, any[]>) {
  const groupMap = new Map<string, { id: string; name: string; color: string; items: any[] }>()

  const groupColors: Record<string, string> = {
    'emailed items': '#00c875',
    'follow up': '#cab641',
    'toyota': '#ff5ac4',
    'current support jobs': '#a25ddc',
    'completed & closed': '#9CD326',
    'completed': '#00c875',
    'done': '#00c875',
    'in progress': '#579bfc',
    'to do': '#c4c4c4',
    'todo': '#c4c4c4',
    'review': '#ffcc00',
    'urgent': '#e2445c',
    'other': '#579BFC',
  }

  const categoryToGroup: Record<string, string> = {
    'not_started': 'To Do',
    'in_progress': 'In Progress',
    'review': 'Review',
    'done': 'Done',
    'cancelled': 'Cancelled',
  }

  for (const item of items) {
    let groupName = item.monday_group_title
    let groupId = item.monday_group_id

    if (!groupName) {
      const statusCategory = item.status_category || 'not_started'
      groupName = categoryToGroup[statusCategory] || item.status_name || 'Other'
      groupId = statusCategory
    }

    const normalizedName = groupName.toLowerCase()
    const color =
      groupColors[normalizedName] ||
      groupColors[normalizedName.split(' ')[0]] ||
      item.status_color ||
      '#579BFC'

    const payload = buildItemPayload(item, columnValuesMap)

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, { id: groupId, name: groupName, color, items: [] })
    }

    groupMap.get(groupId)!.items.push(payload)
  }

  const groupOrder = [
    'to do', 'in progress', 'review', 'done',
    'completed', 'completed & closed', 'cancelled', 'other',
  ]

  const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
    const aIndex = groupOrder.indexOf(a.name.toLowerCase())
    const bIndex = groupOrder.indexOf(b.name.toLowerCase())
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  return sortedGroups.map((g) => ({ ...g, isExpanded: true }))
}

function getStatusColor(category: string | null): string {
  if (!category) return '#6B7280'
  const colors: Record<string, string> = {
    'not_started': '#c4c4c4',
    'in_progress': '#579bfc',
    'review': '#ffcc00',
    'done': '#00c875',
    'cancelled': '#e2445c',
  }
  return colors[category] || '#6B7280'
}
