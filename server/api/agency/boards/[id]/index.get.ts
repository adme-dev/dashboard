/**
 * Get Board Data with Groups and Items
 * GET /api/agency/boards/:id
 */

import { createError, getQuery, getRouterParam } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryRows, queryOne } from '../../../../utils/db'

// Check if a string is a valid UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)
  
  const search = (query.search as string) || ''

  if (!boardId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Board ID is required'
    })
  }

  try {
    // Find department by ID or slug
    let boardInfo: any = null
    
    if (isUUID(boardId)) {
      boardInfo = await queryOne(`
        SELECT id, name, slug FROM departments WHERE id = $1
      `, [boardId])
    } else {
      boardInfo = await queryOne(`
        SELECT id, name, slug FROM departments WHERE slug = $1
      `, [boardId])
    }

    const departmentId = boardInfo?.id || null
    const boardName = boardInfo?.name || ''

    if (!departmentId) {
      return {
        id: boardId,
        name: 'Board Not Found',
        groups: []
      }
    }

    return await fetchBoardData(departmentId, boardName, search)
    
  } catch (error: any) {
    console.error('Failed to fetch board:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch board: ${error.message}`
    })
  }
})

async function fetchBoardData(departmentId: string, boardName: string, search: string) {
  // Build search condition
  let searchCondition = ''
  const params: any[] = [departmentId]
  if (search) {
    searchCondition = 'AND t.title ILIKE $2'
    params.push(`%${search}%`)
  }

  console.log('[Board API] Fetching tasks for department:', departmentId)

  // Get ALL tasks for this department - LEFT JOIN to include tasks without Monday mappings
  const items = await queryRows(`
    SELECT
      t.id,
      t.title as title,
      t.description,
      t.due_date,
      t.priority,
      t.status_id,
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
      -- Monday group info (nullable)
      mim.source_data->'group'->>'title' as monday_group_title,
      mim.source_data->'group'->>'id' as monday_group_id
    FROM tasks t
    LEFT JOIN monday_item_mappings mim ON mim.task_id = t.id
    LEFT JOIN task_statuses ts ON t.status_id = ts.id
    LEFT JOIN team_members tm ON t.assignee_id = tm.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN agency_clients ac ON p.client_id = ac.id
    WHERE t.department_id = $1
    ${searchCondition}
    ORDER BY t.updated_at DESC
  `, params)

  console.log('[Board API] Found', items.length, 'tasks')

  // Get column values separately for each task
  const taskIds = items.map(i => i.id)
  let columnValuesMap: Map<string, any[]> = new Map()
  
  if (taskIds.length > 0) {
    const columnValues = await queryRows(`
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
    
    for (const cv of columnValues) {
      if (!columnValuesMap.has(cv.task_id)) {
        columnValuesMap.set(cv.task_id, [])
      }
      columnValuesMap.get(cv.task_id)!.push(cv)
    }
  }

  // Group items by their Monday groups (or status if no Monday group)
  const groups = groupItemsByGroups(items, columnValuesMap, boardName)

  // Calculate totals
  const totalItems = items.length
  const lastUpdated = items.length > 0 
    ? items[0].updated_at 
    : new Date()

  return {
    id: departmentId,
    name: boardName,
    groups,
    totalItems,
    lastUpdated: lastUpdated instanceof Date ? lastUpdated.toISOString() : lastUpdated
  }
}

function groupItemsByGroups(items: any[], columnValuesMap: Map<string, any[]>, boardName: string) {
  const groupMap = new Map<string, { 
    id: string
    name: string 
    color: string
    items: any[]
  }>()

  // Default group colors
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
    'other': '#579BFC'
  }

  for (const item of items) {
    // Get group from Monday data OR use status category as fallback
    let groupName = item.monday_group_title 
    let groupId = item.monday_group_id 
    
    // If no Monday group, use status category
    if (!groupName) {
      const statusCategory = item.status_category || 'not_started'
      const statusName = item.status_name || 'Unknown'
      
      // Map status categories to group names
      const categoryToGroup: Record<string, string> = {
        'not_started': 'To Do',
        'in_progress': 'In Progress',
        'review': 'Review',
        'done': 'Done',
        'cancelled': 'Cancelled'
      }
      
      groupName = categoryToGroup[statusCategory] || statusName
      groupId = statusCategory
    }
    
    const normalizedName = groupName.toLowerCase()
    const color = groupColors[normalizedName] || 
                  groupColors[normalizedName.split(' ')[0]] || 
                  item.status_color || 
                  '#579BFC'
    
    const columnValues = columnValuesMap.get(item.id) || []
    
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        id: groupId,
        name: groupName,
        color: color,
        items: []
      })
    }
    
    const group = groupMap.get(groupId)!
    
    group.items.push({
      id: item.id,
      title: item.title,
      description: item.description,
      dueDate: item.due_date,
      priority: item.priority,
      status: item.status_name || 'Unknown',
      statusColor: item.status_color || getStatusColor(item.status_category),
      assignees: item.assignee_id ? [{
        id: item.assignee_id,
        name: item.assignee_name,
        avatar: item.assignee_avatar
      }] : [],
      clients: item.client_name ? [item.client_name] : [],
      updatedAt: item.updated_at,
      columnValues: columnValues
    })
  }

  // Sort groups by order
  const groupOrder = ['to do', 'in progress', 'review', 'done', 'completed', 'completed & closed', 'cancelled', 'other']
  
  const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
    const aIndex = groupOrder.indexOf(a.name.toLowerCase())
    const bIndex = groupOrder.indexOf(b.name.toLowerCase())
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  return sortedGroups.map(g => ({
    ...g,
    isExpanded: true
  }))
}

function getStatusColor(category: string | null): string {
  if (!category) return '#6B7280'
  
  const colors: Record<string, string> = {
    'not_started': '#c4c4c4',
    'in_progress': '#579bfc',
    'review': '#ffcc00',
    'done': '#00c875',
    'cancelled': '#e2445c'
  }
  
  return colors[category] || '#6B7280'
}
