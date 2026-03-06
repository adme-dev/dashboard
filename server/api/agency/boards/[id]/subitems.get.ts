/**
 * Batch Fetch Subitems for Board View
 * GET /api/agency/boards/:id/subitems?taskIds=uuid1,uuid2,...
 *
 * Returns subtasks grouped by parent task ID, with column values.
 */

import { createError, getQuery, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const taskIdsParam = (query.taskIds as string) || ''

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  if (!taskIdsParam) {
    return { subitems: {} }
  }

  // Parse and validate UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const taskIds = taskIdsParam.split(',').filter(id => uuidRegex.test(id.trim())).map(id => id.trim())

  if (taskIds.length === 0) {
    return { subitems: {} }
  }

  try {
    // Fetch subtasks for all parent task IDs
    const items = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.due_date,
        t.start_date,
        t.priority,
        t.status_id,
        t.parent_task_id,
        t.group_id,
        t.sort_order,
        t.completed_at,
        t.created_at,
        t.updated_at,
        COALESCE(t.progress_percentage, 0) as progress_percentage,
        ts.name as status_name,
        ts.color as status_color,
        ts.category as status_category,
        tm.id as assignee_id,
        tm.name as assignee_name,
        tm.avatar_url as assignee_avatar
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      WHERE t.parent_task_id = ANY($1)
      ORDER BY t.sort_order, t.created_at
    `, [taskIds])

    const subitemIds = items.map((i: any) => i.id)

    // Load column values for subitems
    let columnValuesMap = new Map<string, any[]>()
    if (subitemIds.length > 0) {
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
      `, [subitemIds])

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
    }

    // Group subitems by parent task ID
    const subitems: Record<string, any[]> = {}
    for (const item of items) {
      const parentId = item.parent_task_id
      if (!subitems[parentId]) {
        subitems[parentId] = []
      }

      const columnValues = columnValuesMap.get(item.id) || []
      const columnValuesObj: Record<string, any> = {}
      for (const cv of columnValues) {
        const slug = cv.columnSlug || cv.columnName
        if (slug) columnValuesObj[slug] = cv
      }

      subitems[parentId].push({
        id: item.id,
        title: item.title,
        description: item.description,
        dueDate: item.due_date,
        startDate: item.start_date,
        priority: item.priority,
        progressPercentage: parseInt(item.progress_percentage) || 0,
        status: item.status_name || 'Unknown',
        statusColor: item.status_color || '#6B7280',
        statusCategory: item.status_category,
        groupId: item.group_id,
        completedAt: item.completed_at,
        sortOrder: item.sort_order,
        assignees: item.assignee_id
          ? [{ id: item.assignee_id, name: item.assignee_name, avatar: item.assignee_avatar }]
          : [],
        columnValues: columnValuesObj,
        columnValuesArray: columnValues,
        updatedAt: item.updated_at,
        createdAt: item.created_at,
      })
    }

    return { subitems }
  } catch (error: any) {
    console.error('Failed to fetch subitems:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch subitems: ${error.message}`,
    })
  }
})
