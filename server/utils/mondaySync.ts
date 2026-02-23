/**
 * Monday.com Live Sync Utilities
 * Handles syncing data from Monday.com to local database
 */

import { MondayClient } from './mondayClient'
import { query, transaction } from './db'

export interface SyncOptions {
  syncComments?: boolean
  syncFiles?: boolean
  syncSubitems?: boolean
  skipArchived?: boolean
}

export interface SyncResult {
  itemsSynced: number
  itemsFailed: number
  errors: string[]
}

/**
 * Sync a Monday.com board to a department
 */
export async function syncMondayBoardToDepartment(
  client: MondayClient,
  boardId: string,
  departmentId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    itemsSynced: 0,
    itemsFailed: 0,
    errors: []
  }

  try {
    // Get board details
    const board = await client.getBoard(boardId)
    if (!board) {
      throw new Error(`Board ${boardId} not found`)
    }

    // Get all items from the board
    let allItems: any[] = []
    let cursor: string | undefined
    
    do {
      const page = await client.getItems(boardId, { limit: 100, cursor })
      allItems = allItems.concat(page.items)
      cursor = page.cursor
    } while (cursor)

    // Map Monday columns to our task structure
    const columnMapping = createColumnMapping(board.columns || [])

    // Process each item
    for (const item of allItems) {
      try {
        await syncItemToTask(client, item, departmentId, columnMapping, options)
        result.itemsSynced++
      } catch (error: any) {
        result.itemsFailed++
        result.errors.push(`Item ${item.id}: ${error.message}`)
      }
    }

    return result
  } catch (error: any) {
    throw new Error(`Failed to sync board ${boardId}: ${error.message}`)
  }
}

/**
 * Sync a single Monday item to a task
 */
async function syncItemToTask(
  client: MondayClient,
  item: any,
  departmentId: string,
  columnMapping: ColumnMapping,
  options: SyncOptions
): Promise<void> {
  await transaction(async (trx) => {
    // Check if task already exists
    const existing = await trx.query(
      'SELECT id FROM tasks WHERE monday_item_id = $1',
      [item.id]
    )

    // Extract values from column_values
    const columnValues = item.column_values || []
    
    // Map Monday status to our status
    const statusValue = getColumnValue(columnValues, columnMapping.status)
    const statusId = await resolveStatusId(trx, departmentId, statusValue)

    // Get other mapped values
    const priority = mapPriority(getColumnValue(columnValues, columnMapping.priority))
    const dueDate = parseDate(getColumnValue(columnValues, columnMapping.dueDate))
    const assigneeId = await resolveAssigneeId(trx, getColumnValue(columnValues, columnMapping.assignee))

    const taskData = {
      title: item.name,
      department_id: departmentId,
      status_id: statusId,
      priority,
      due_date: dueDate,
      assignee_id: assigneeId,
      monday_item_id: item.id,
      monday_board_id: item.board_id,
      updated_at: new Date().toISOString()
    }

    if (existing.rows.length > 0) {
      // Update existing task
      const taskId = existing.rows[0].id
      await trx.query(`
        UPDATE tasks SET
          title = $1,
          status_id = $2,
          priority = $3,
          due_date = $4,
          assignee_id = $5,
          updated_at = $6
        WHERE id = $7
      `, [
        taskData.title,
        taskData.status_id,
        taskData.priority,
        taskData.due_date,
        taskData.assignee_id,
        taskData.updated_at,
        taskId
      ])
    } else {
      // Create new task
      await trx.query(`
        INSERT INTO tasks (
          title, department_id, status_id, priority, due_date,
          assignee_id, monday_item_id, monday_board_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      `, [
        taskData.title,
        taskData.department_id,
        taskData.status_id,
        taskData.priority,
        taskData.due_date,
        taskData.assignee_id,
        taskData.monday_item_id,
        taskData.monday_board_id
      ])
    }

    // Sync subitems if enabled
    if (options.syncSubitems) {
      const subitems = await client.getSubitems(item.id)
      for (const subitem of subitems) {
        // Create subtasks
        await syncSubitemToSubtask(trx, subitem, existing.rows[0]?.id, departmentId)
      }
    }
  })
}

/**
 * Sync a Monday subitem to a subtask
 */
async function syncSubitemToSubtask(
  trx: any,
  subitem: any,
  parentTaskId: string | undefined,
  departmentId: string
): Promise<void> {
  if (!parentTaskId) return

  const existing = await trx.query(
    'SELECT id FROM tasks WHERE monday_item_id = $1',
    [subitem.id]
  )

  if (existing.rows.length > 0) {
    await trx.query(`
      UPDATE tasks SET
        title = $1,
        parent_task_id = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [subitem.name, parentTaskId, existing.rows[0].id])
  } else {
    await trx.query(`
      INSERT INTO tasks (
        title, parent_task_id, department_id, status_id,
        monday_item_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    `, [
      subitem.name,
      parentTaskId,
      departmentId,
      null, // Will need to map status
      subitem.id
    ])
  }
}

// Helper types and functions
interface ColumnMapping {
  status?: string
  priority?: string
  dueDate?: string
  assignee?: string
}

function createColumnMapping(columns: any[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  
  for (const col of columns) {
    const title = col.title?.toLowerCase() || ''
    
    if (col.type === 'status' || title.includes('status') || title.includes('state')) {
      mapping.status = col.id
    } else if (title.includes('priority') || title.includes('urgent')) {
      mapping.priority = col.id
    } else if (col.type === 'date' && (title.includes('due') || title.includes('deadline'))) {
      mapping.dueDate = col.id
    } else if (col.type === 'people' || col.type === 'person' || title.includes('assignee') || title.includes('owner')) {
      mapping.assignee = col.id
    }
  }
  
  return mapping
}

function getColumnValue(columnValues: any[], columnId?: string): any {
  if (!columnId) return null
  const col = columnValues.find(c => c.id === columnId)
  return col?.text || col?.value || null
}

function mapPriority(mondayPriority: string | null): string {
  if (!mondayPriority) return 'medium'
  const p = mondayPriority.toLowerCase()
  if (p.includes('urgent') || p.includes('critical')) return 'urgent'
  if (p.includes('high')) return 'high'
  if (p.includes('low')) return 'low'
  return 'medium'
}

function parseDate(dateValue: string | null): string | null {
  if (!dateValue) return null
  try {
    const date = new Date(dateValue)
    return date.toISOString().split('T')[0]
  } catch {
    return null
  }
}

async function resolveStatusId(trx: any, departmentId: string, statusValue: string | null): Promise<string | null> {
  if (!statusValue) {
    // Return default status for department
    const result = await trx.query(`
      SELECT id FROM task_statuses 
      WHERE department_id = $1 AND is_default = true
      LIMIT 1
    `, [departmentId])
    return result.rows[0]?.id || null
  }

  // Try to find matching status by name
  const result = await trx.query(`
    SELECT id FROM task_statuses 
    WHERE department_id = $1 AND LOWER(name) = LOWER($2)
    LIMIT 1
  `, [departmentId, statusValue])

  if (result.rows[0]) {
    return result.rows[0].id
  }

  // Return default if no match
  const defaultResult = await trx.query(`
    SELECT id FROM task_statuses 
    WHERE department_id = $1 AND is_default = true
    LIMIT 1
  `, [departmentId])
  return defaultResult.rows[0]?.id || null
}

async function resolveAssigneeId(trx: any, assigneeValue: string | null): Promise<string | null> {
  if (!assigneeValue) return null
  
  // Try to match by name or email
  const result = await trx.query(`
    SELECT id FROM team_members 
    WHERE LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($1)
    LIMIT 1
  `, [assigneeValue])
  
  return result.rows[0]?.id || null
}
