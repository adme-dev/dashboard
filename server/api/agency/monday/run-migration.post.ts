/**
 * Run Complete Monday.com Migration with Workspaces
 * POST /api/agency/monday/run-migration
 */

import { createError } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { createMondayClient } from '../../../utils/mondayClient'
import { query, transaction } from '../../../utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { workspaceIds, workspaceMappings } = body

  if (!workspaceIds || workspaceIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Select at least one workspace' })
  }

  const client = await createMondayClient(process.env.MONDAY_API_TOKEN)
  
  // Get departments
  const departments = await query<{ id: string, name: string }>('SELECT id, name FROM departments WHERE is_active = true')

  // Get all boards
  const allBoards = await client.getBoards({ limit: 500, state: 'active' })
  
  // Filter boards by selected workspaces
  const boardsToMigrate = allBoards.filter(b => 
    workspaceIds.includes(b.workspace_id) && 
    b.type === 'board' && 
    !b.name.startsWith('Subitems of')
  )

  // Create migration session
  const sessionResult = await query<{ id: string }>(`
    INSERT INTO monday_migration_sessions (
      status, started_by, monday_account_id, monday_account_name,
      boards_total, items_total, items_migrated, items_failed, config, started_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    RETURNING id
  `, [
    'running', user.id, '229224', 'ADME Advertising Pty Ltd',
    boardsToMigrate.length,
    boardsToMigrate.reduce((sum, b) => sum + (b.items_count || 0), 0),
    0, 0,
    JSON.stringify({ workspaceIds, workspaceMappings })
  ])
  
  const sessionId = sessionResult[0]?.id

  const results = {
    sessionId,
    workspacesProcessed: 0,
    boardsProcessed: 0,
    itemsImported: 0,
    itemsFailed: 0,
    boards: [] as any[]
  }

  for (const board of boardsToMigrate) {
    // Get workspace mapping or auto-detect
    const workspaceId = board.workspace_id
    let departmentId = workspaceMappings?.[workspaceId]
    
    if (!departmentId) {
      // Auto-map by workspace/board name
      const wsName = board.name.toLowerCase()
      const deptMatch = departments.find(d => {
        const name = d.name.toLowerCase()
        return wsName.includes(name) ||
               (workspaceId === '22033' && name === 'marketing') || // Marketing workspace
               (workspaceId === '22000' && name === 'web') || // Web workspace
               (workspaceId === '22028' && name === 'admin') || // ADME workspace
               (workspaceId === '2277481' && name === 'account services') // Client boards
      })
      departmentId = deptMatch?.id || departments[0]?.id
    }

    try {
      const mappingResult = await query<{ id: string }>(`
        INSERT INTO monday_board_mappings (
          migration_session_id, monday_board_id, monday_board_name,
          monday_board_type, department_id, status, items_total, started_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id
      `, [sessionId, board.id, board.name, board.type, departmentId, 'running', board.items_count || 0])
      
      const mappingId = mappingResult[0]?.id
      
      // Import items
      let cursor: string | undefined
      let itemsImported = 0
      let itemsFailed = 0
      
      do {
        const page = await client.getItems(board.id, { limit: 100, cursor })
        
        for (const item of page.items) {
          try {
            await importItem(item, board.id, departmentId, mappingId)
            itemsImported++
          } catch {
            itemsFailed++
          }
        }
        
        cursor = page.cursor
      } while (cursor)
      
      await query(`
        UPDATE monday_board_mappings
        SET items_migrated = $1, items_failed = $2, status = $3, completed_at = NOW()
        WHERE id = $4
      `, [itemsImported, itemsFailed, itemsFailed > 0 ? 'partial' : 'completed', mappingId])
      
      results.boardsProcessed++
      results.itemsImported += itemsImported
      results.itemsFailed += itemsFailed
      results.boards.push({ name: board.name, itemsImported, itemsFailed })
      
    } catch (err: any) {
      console.error(`Board ${board.name} failed:`, err)
      results.itemsFailed += board.items_count || 0
    }
  }

  results.workspacesProcessed = new Set(boardsToMigrate.map(b => b.workspace_id)).size

  await query(`
    UPDATE monday_migration_sessions
    SET status = $1, items_migrated = $2, items_failed = $3, completed_at = NOW()
    WHERE id = $4
  `, [results.itemsFailed > 0 ? 'partial' : 'completed', results.itemsImported, results.itemsFailed, sessionId])

  return { success: true, ...results }
})

async function importItem(item: any, boardId: string, departmentId: string, mappingId: string) {
  await transaction(async (trx) => {
    const columnValues = item.column_values || []
    
    // Map status
    const statusCol = columnValues.find((c: any) => c.type === 'status')
    let statusId = null
    if (statusCol?.text) {
      const r = await trx.query(`SELECT id FROM task_statuses WHERE department_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [departmentId, statusCol.text])
      statusId = r.rows[0]?.id
    }
    if (!statusId) {
      const r = await trx.query(`SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1`, [departmentId])
      statusId = r.rows[0]?.id
    }
    
    // Get date
    const dateCol = columnValues.find((c: any) => c.type === 'date')
    const dueDate = dateCol?.text || null
    
    // Get assignee
    const peopleCol = columnValues.find((c: any) => c.type === 'people')
    let assigneeId = null
    if (peopleCol?.text) {
      const r = await trx.query(`SELECT id FROM team_members WHERE LOWER(name) = LOWER($1) LIMIT 1`, [peopleCol.text])
      assigneeId = r.rows[0]?.id
    }

    // Create task
    const taskResult = await trx.query(`
      INSERT INTO tasks (department_id, status_id, title, due_date, assignee_id, priority, task_type, monday_item_id, monday_board_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (monday_item_id) DO UPDATE SET
        title = EXCLUDED.title, status_id = EXCLUDED.status_id, due_date = EXCLUDED.due_date, assignee_id = EXCLUDED.assignee_id, updated_at = NOW()
      RETURNING id
    `, [departmentId, statusId, item.name, dueDate, assigneeId, 'medium', 'task', item.id, boardId, item.created_at || new Date().toISOString()])
    
    const taskId = taskResult.rows[0].id

    // Store column values
    for (const col of columnValues) {
      await trx.query(`
        INSERT INTO task_monday_column_values (task_id, column_id, column_title, column_type, text_value, json_value)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (task_id, column_id) DO UPDATE SET text_value = EXCLUDED.text_value, json_value = EXCLUDED.json_value, updated_at = NOW()
      `, [taskId, col.id, col.title, col.type, col.text, col.value ? JSON.parse(col.value) : null])
    }

    // Create mapping
    await trx.query(`
      INSERT INTO monday_item_mappings (board_mapping_id, monday_item_id, task_id, monday_item_name, status)
      VALUES ($1, $2, $3, $4, 'synced')
      ON CONFLICT (monday_item_id) DO UPDATE SET task_id = EXCLUDED.task_id, status = 'synced'
    `, [mappingId, item.id, taskId, item.name])
  })
}
