/**
 * Get Single Task Detail
 * GET /api/agency/tasks/:id
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryOne, queryRows } from '../../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const taskId = getRouterParam(event, 'id')

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Get task with all related data
    const task = await queryOne(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.due_date,
        t.priority,
        t.created_at,
        t.updated_at,
        ts.name as status_name,
        ts.color as status_color,
        d.id as board_id,
        d.name as board_name,
        d.slug as board_slug,
        tm.id as assignee_id,
        tm.name as assignee_name,
        tm.avatar_url as assignee_avatar,
        mim.source_data->'group'->>'title' as group_name,
        mim.source_data->'group'->>'color' as group_color,
        mim.monday_item_id,
        mim.monday_board_id
      FROM tasks t
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      LEFT JOIN monday_item_mappings mim ON mim.task_id = t.id
      WHERE t.id = $1
    `, [taskId])

    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Get column values
    const columnValues = await queryRows(`
      SELECT
        monday_column_id as column_id,
        column_title,
        column_type,
        text_value,
        value_json
      FROM task_monday_column_values
      WHERE task_id = $1
      ORDER BY column_title
    `, [taskId])

    // Get assignees from "Who" column if available
    let assignees: any[] = []
    const whoColumn = columnValues.find((c: any) => 
      c.column_title?.toLowerCase().includes('who') || 
      c.column_type === 'people'
    )
    
    if (whoColumn?.text_value) {
      assignees = whoColumn.text_value.split(',').map((name: string) => ({
        name: name.trim(),
        avatar: null
      }))
    }

    // Get clients from dropdown
    let clients: string[] = []
    const clientColumn = columnValues.find((c: any) => 
      c.column_title?.toLowerCase().includes('client') || 
      c.column_type === 'dropdown'
    )
    
    if (clientColumn?.text_value) {
      clients = clientColumn.text_value.split(',').map((c: string) => c.trim())
    }

    // Get subitems if any
    const subitems = await queryRows(`
      SELECT
        t.id,
        t.title,
        ts.name as status_name
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.parent_task_id = $1
    `, [taskId])

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.due_date,
      priority: task.priority,
      status: task.status_name || 'Unknown',
      statusColor: task.status_color,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      boardId: task.board_id,
      boardName: task.board_name,
      boardSlug: task.board_slug,
      groupName: task.group_name,
      groupColor: task.group_color,
      assignee: task.assignee_id ? {
        id: task.assignee_id,
        name: task.assignee_name,
        avatar: task.assignee_avatar
      } : null,
      assignees: assignees.length > 0 ? assignees : (task.assignee_id ? [{
        name: task.assignee_name,
        avatar: task.assignee_avatar
      }] : []),
      clients,
      columnValues,
      subitems,
      mondayItemId: task.monday_item_id,
      mondayBoardId: task.monday_board_id
    }

  } catch (error: any) {
    console.error('Failed to fetch task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch task: ${error.message}`
    })
  }
})
