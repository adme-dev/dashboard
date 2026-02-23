/**
 * Import a specific board from Monday.com by name or ID
 * POST /api/agency/monday/import-board
 */

import { createError, readBody } from 'h3'
import { createMondayClient } from '../../../utils/mondayClient'
import { requireAuth } from '../../../utils/auth'
import { queryOne, queryRows, execute } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { boardName, boardId, departmentId } = body

  if (!boardName && !boardId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Either boardName or boardId is required'
    })
  }

  try {
    const client = await createMondayClient()
    
    // Get all boards from Monday
    const boards = await client.getBoards({ limit: 500 })
    
    // Find the target board
    let targetBoard = null
    
    if (boardId) {
      targetBoard = boards.find(b => b.id === boardId)
    } else if (boardName) {
      // Search by name (case-insensitive partial match)
      const searchTerm = boardName.toLowerCase()
      targetBoard = boards.find(b => 
        b.name.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(b.name.toLowerCase())
      )
    }

    if (!targetBoard) {
      // Return available boards for reference
      const availableBoards = boards.map(b => ({
        id: b.id,
        name: b.name,
        type: b.type,
        state: b.state,
        workspaceId: b.workspace_id,
        itemCount: b.items_count
      }))
      
      return {
        success: false,
        error: `Board not found: ${boardName || boardId}`,
        availableBoards: availableBoards.slice(0, 20) // Limit to first 20
      }
    }

    // Get or create a department for this board
    let deptId = departmentId
    if (!deptId) {
      // Try to find existing department with matching name
      const existingDept = await queryOne(
        'SELECT id FROM departments WHERE name ILIKE $1 LIMIT 1',
        [`%${targetBoard.name}%`]
      )
      
      if (existingDept) {
        deptId = existingDept.id
      } else {
        // Create a new department
        const slug = targetBoard.name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
        
        const newDept = await queryOne(
          `INSERT INTO departments (name, slug, color, description, is_active)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id`,
          [
            targetBoard.name,
            slug,
            '#579BFC',
            `Imported from Monday.com board (ID: ${targetBoard.id})`
          ]
        )
        deptId = newDept!.id
      }
    }

    // Get default status for this department
    const defaultStatus = await queryOne(
      'SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1',
      [deptId]
    )
    
    const statusId = defaultStatus?.id || await queryOne(
      'SELECT id FROM task_statuses WHERE department_id = $1 ORDER BY sort_order LIMIT 1',
      [deptId]
    ).then(r => r?.id)

    // Get all items from the board
    const itemsResult = await client.getItems(targetBoard.id, { limit: 500 })
    const items = itemsResult.items

    // Import items as tasks
    let importedCount = 0
    let failedCount = 0
    const errors: string[] = []

    for (const item of items) {
      try {
        // Extract assignee from people column if available
        let assigneeId = null
        const peopleColumn = item.column_values?.find(cv => cv.type === 'people')
        if (peopleColumn?.value) {
          try {
            const parsed = JSON.parse(peopleColumn.value)
            const personId = parsed?.personsAndTeams?.[0]?.id
            if (personId) {
              // Try to find matching team member
              const member = await queryOne(
                'SELECT id FROM team_members WHERE monday_user_id = $1 LIMIT 1',
                [personId]
              )
              if (member) assigneeId = member.id
            }
          } catch {
            // ignore
          }
        }

        // Extract due date
        let dueDate = null
        const dateColumn = item.column_values?.find(cv => cv.type === 'date')
        if (dateColumn?.value) {
          try {
            const parsed = JSON.parse(dateColumn.value)
            dueDate = parsed?.date
          } catch {
            // ignore
          }
        }

        // Extract priority from status
        let priority = 'medium'
        const statusColumn = item.column_values?.find(cv => cv.type === 'status')
        if (statusColumn?.value) {
          try {
            const parsed = JSON.parse(statusColumn.value)
            const label = parsed?.label?.text?.toLowerCase() || ''
            if (label.includes('urgent') || label.includes('critical')) priority = 'urgent'
            else if (label.includes('high')) priority = 'high'
            else if (label.includes('low')) priority = 'low'
          } catch {
            // ignore
          }
        }

        // Check if this Monday item already exists
        const existingMapping = await queryOne(
          `SELECT task_id FROM monday_item_mappings 
           WHERE monday_item_id = $1 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [item.id]
        )

        let taskId: string

        if (existingMapping?.task_id) {
          // Update existing task
          await execute(
            `UPDATE tasks SET
              title = $1,
              priority = $2,
              assignee_id = $3,
              due_date = $4,
              updated_at = NOW()
             WHERE id = $5`,
            [item.name, priority, assigneeId, dueDate, existingMapping.task_id]
          )
          taskId = existingMapping.task_id
        } else {
          // Create new task
          const newTask = await queryOne(
            `INSERT INTO tasks 
             (department_id, status_id, title, description, priority, assignee_id, due_date, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              deptId,
              statusId,
              item.name,
              null, // description
              priority,
              assigneeId,
              dueDate,
              item.created_at,
              item.updated_at
            ]
          )
          taskId = newTask!.id

          // Create mapping record
          await execute(
            `INSERT INTO monday_item_mappings 
             (monday_item_id, monday_item_name, monday_board_id, task_id, source_data, status)
             VALUES ($1, $2, $3, $4, $5, 'completed')
             ON CONFLICT (monday_item_id) 
             DO UPDATE SET
               task_id = EXCLUDED.task_id,
               updated_at = NOW()`,
            [
              item.id,
              item.name,
              targetBoard.id,
              taskId,
              JSON.stringify(item)
            ]
          )
        }

        const task = { id: taskId }

        // Store column values
        if (taskId && item.column_values) {
          for (const col of item.column_values) {
            let jsonValue = null
            if (col.value) {
              try {
                jsonValue = JSON.parse(col.value)
              } catch {
                jsonValue = { text: col.value }
              }
            }
            
            await execute(
              `INSERT INTO task_monday_column_values 
               (task_id, monday_column_id, column_title, column_type, text_value, value_json)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (task_id, monday_column_id)
               DO UPDATE SET
                 text_value = EXCLUDED.text_value,
                 value_json = EXCLUDED.value_json,
                 migrated_at = NOW()`,
              [
                taskId,
                col.id,
                col.title || col.id,
                col.type,
                col.text,
                jsonValue
              ]
            ).catch(() => {
              // Ignore column value errors
            })
          }
        }

        importedCount++
      } catch (err: any) {
        failedCount++
        errors.push(`Failed to import item ${item.id}: ${err.message}`)
      }
    }

    return {
      success: true,
      board: {
        id: targetBoard.id,
        name: targetBoard.name,
        state: targetBoard.state,
        workspaceId: targetBoard.workspace_id
      },
      departmentId: deptId,
      imported: importedCount,
      failed: failedCount,
      total: items.length,
      errors: errors.slice(0, 10) // Limit errors
    }

  } catch (error: any) {
    console.error('Import board error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to import board: ${error.message}`
    })
  }
})
