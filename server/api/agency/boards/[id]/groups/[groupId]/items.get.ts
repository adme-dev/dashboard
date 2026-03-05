/**
 * Get Group Items (paginated)
 * GET /api/agency/boards/:id/groups/:groupId/items?offset=0&limit=50
 *
 * Loads items for a specific group with pagination.
 * Supports both board_groups (UUID) and legacy groups (Monday group ID or status category).
 */

import { getQuery, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const boardIdParam = getRouterParam(event, 'id')
  const groupId = getRouterParam(event, 'groupId')
  const query = getQuery(event)
  const offset = Math.max(0, Number(query.offset) || 0)
  const limit = Math.min(Number(query.limit) || 50, 200)

  if (!boardIdParam || !groupId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID and Group ID required' })
  }

  // Resolve board
  const boardInfo = isUUID(boardIdParam)
    ? await queryOne('SELECT id FROM departments WHERE id = $1', [boardIdParam])
    : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardIdParam])

  if (!boardInfo) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found' })
  }

  const departmentId = boardInfo.id

  // Determine if this is a board_group (UUID) or legacy group
  const isBoardGroup = isUUID(groupId)

  let items: any[]
  let totalCount: number

  if (isBoardGroup) {
    // Modern board_groups — filter by group_id
    const countResult = await queryOne<{ count: string }>(`
      SELECT COUNT(*) as count FROM tasks
      WHERE department_id = $1 AND group_id = $2 AND parent_task_id IS NULL
    `, [departmentId, groupId])
    totalCount = parseInt(countResult?.count || '0', 10)

    items = await queryRows(`
      SELECT
        t.id, t.title, t.description, t.due_date, t.start_date, t.task_type,
        COALESCE(t.progress_percentage, 0) as progress_percentage,
        t.priority, t.status_id, t.group_id, t.parent_task_id,
        t.created_at, t.updated_at,
        ts.name as status_name, ts.color as status_color, ts.category as status_category,
        tm.id as assignee_id, tm.name as assignee_name, tm.avatar_url as assignee_avatar,
        p.id as project_id, p.name as project_name,
        ac.name as client_name
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN agency_clients ac ON p.client_id = ac.id
      WHERE t.department_id = $1 AND t.group_id = $2 AND t.parent_task_id IS NULL
      ORDER BY t.sort_order, t.updated_at DESC
      LIMIT $3 OFFSET $4
    `, [departmentId, groupId, limit, offset])
  } else {
    // Legacy grouping — group by Monday group ID or status category
    // Load items that match this legacy group
    const allItems = await queryRows(`
      SELECT
        t.id, t.title, t.description, t.due_date, t.start_date, t.task_type,
        COALESCE(t.progress_percentage, 0) as progress_percentage,
        t.priority, t.status_id, t.group_id, t.parent_task_id,
        t.created_at, t.updated_at,
        ts.name as status_name, ts.color as status_color, ts.category as status_category,
        tm.id as assignee_id, tm.name as assignee_name, tm.avatar_url as assignee_avatar,
        p.id as project_id, p.name as project_name,
        ac.name as client_name,
        mim.source_data->'group'->>'id' as monday_group_id,
        mim.source_data->'group'->>'title' as monday_group_title
      FROM tasks t
      LEFT JOIN monday_item_mappings mim ON mim.task_id = t.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN agency_clients ac ON p.client_id = ac.id
      WHERE t.department_id = $1 AND t.parent_task_id IS NULL
      ORDER BY t.sort_order, t.updated_at DESC
    `, [departmentId])

    // Filter to items matching this legacy group
    const categoryToGroup: Record<string, string> = {
      'not_started': 'To Do',
      'in_progress': 'In Progress',
      'review': 'Review',
      'done': 'Done',
      'cancelled': 'Cancelled',
    }

    const matchingItems = allItems.filter((item: any) => {
      const itemGroupId = item.monday_group_id || item.status_category || 'not_started'
      return itemGroupId === groupId
    })

    totalCount = matchingItems.length
    items = matchingItems.slice(offset, offset + limit)
  }

  // Load column values for the paginated items
  const taskIds = items.map((i: any) => i.id)
  let columnValues: any[] = []
  if (taskIds.length > 0) {
    columnValues = await queryRows(`
      SELECT
        tcv.task_id, tcv.column_id,
        cc.slug as column_slug, cc.column_type, cc.name as column_name,
        tcv.text_value, tcv.number_value, tcv.date_value, tcv.date_end_value, tcv.json_value
      FROM task_column_values tcv
      JOIN custom_columns cc ON cc.id = tcv.column_id
      WHERE tcv.task_id = ANY($1)
    `, [taskIds])
  }

  // Build column values map
  const columnValuesMap = new Map<string, any[]>()
  for (const cv of columnValues) {
    if (!columnValuesMap.has(cv.task_id)) columnValuesMap.set(cv.task_id, [])
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

  // Build item payloads
  const formattedItems = items.map((item: any) => {
    const cvs = columnValuesMap.get(item.id) || []
    const columnValuesObj: Record<string, any> = {}
    for (const cv of cvs) {
      const slug = cv.columnSlug || cv.columnName
      if (slug) columnValuesObj[slug] = cv
    }

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      dueDate: item.due_date,
      startDate: item.start_date,
      taskType: item.task_type || 'task',
      progressPercentage: parseInt(item.progress_percentage) || 0,
      priority: item.priority,
      status: item.status_name || 'Unknown',
      statusColor: item.status_color || '#6B7280',
      groupId: item.group_id || null,
      assignees: item.assignee_id
        ? [{ id: item.assignee_id, name: item.assignee_name, avatar: item.assignee_avatar }]
        : [],
      clients: item.client_name ? [item.client_name] : [],
      updatedAt: item.updated_at,
      columnValues: columnValuesObj,
      columnValuesArray: cvs,
      dependencies: [],
    }
  })

  return {
    items: formattedItems,
    totalCount,
    offset,
    limit,
    hasMore: offset + limit < totalCount,
  }
})
