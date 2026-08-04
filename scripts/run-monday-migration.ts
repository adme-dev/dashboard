/**
 * Direct Monday.com Migration Script
 * Run with: npx tsx scripts/run-monday-migration.ts
 */

import { createMondayClient } from '../server/utils/mondayClient'
import { query, transaction } from '../server/utils/db'

const API_TOKEN = process.env.MONDAY_API_TOKEN

if (!API_TOKEN) {
  throw new Error('MONDAY_API_TOKEN is required')
}

// Workspace to Department mapping
const WORKSPACE_MAP: Record<string, { name: string; deptSlug: string }> = {
  '22033': { name: 'Marketing', deptSlug: 'marketing' },
  '22000': { name: 'Web', deptSlug: 'creative' },
  '22028': { name: 'ADME', deptSlug: 'operations' },
  '2277481': { name: 'CLIENT BOARDS', deptSlug: 'account-services' },
  '22019': { name: 'Production', deptSlug: 'production' },
  '22032': { name: 'Sales', deptSlug: 'sales' },
}

async function runMigration() {
  console.log('🚀 Starting Monday.com Migration...\n')
  
  const client = await createMondayClient(API_TOKEN)
  
  // Get departments
  const deptsResult = await query('SELECT id, name, slug FROM departments WHERE is_active = true')
  const departments = deptsResult.rows
  console.log(`📋 Found ${departments.length} departments:`, departments.map((d: any) => d.name).join(', '))
  
  // Get all boards
  console.log('\n📥 Fetching boards from Monday.com...')
  const boards = await client.getBoards({ limit: 500, state: 'active' })
  const mainBoards = boards.filter((b: any) => 
    b.type === 'board' && 
    !b.name.startsWith('Subitems of')
  )
  console.log(`   Found ${mainBoards.length} boards (excluding subitems)`)
  
  // Create migration session
  const sessionResult = await query(`
    INSERT INTO monday_migration_sessions (
      status, monday_account_id, monday_account_name,
      boards_total, items_total, items_migrated, items_failed, started_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id
  `, [
    'running', '229224', 'ADME Advertising Pty Ltd',
    mainBoards.length,
    mainBoards.reduce((sum, b) => sum + (b.items_count || 0), 0),
    0, 0
  ])
  const sessionId = sessionResult.rows[0].id
  
  let totalImported = 0
  let totalFailed = 0
  let boardsProcessed = 0
  
  // Process each board
  for (const board of mainBoards) {
    const workspaceId = board.workspace_id || 'unknown'
    const mapping = WORKSPACE_MAP[workspaceId]
    const dept = departments.find((d: any) => d.slug === mapping?.deptSlug) || departments[0]
    
    console.log(`\n📌 ${board.name} (${board.items_count || 0} items) → ${dept.name}`)
    
    try {
      // Create board mapping
      const mappingResult = await query(`
        INSERT INTO monday_board_mappings (
          migration_session_id, monday_board_id, monday_board_name,
          monday_board_type, department_id, status, items_total, started_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id
      `, [sessionId, board.id, board.name, board.type, dept.id, 'migrating', board.items_count || 0])
      
      const mappingId = mappingResult.rows[0].id
      
      // Import items
      let cursor: string | undefined
      let itemsImported = 0
      let itemsFailed = 0
      
      do {
        const page = await client.getItems(board.id, { limit: 100, cursor })
        
        for (const item of page.items) {
          try {
            await importItem(client, item, board.id, dept.id, mappingId)
            itemsImported++
            totalImported++
            process.stdout.write('.')
          } catch (err) {
            itemsFailed++
            totalFailed++
            process.stdout.write('x')
          }
        }
        
        cursor = page.cursor
      } while (cursor)
      
      await query(`
        UPDATE monday_board_mappings
        SET items_migrated = $1, items_failed = $2, status = $3, completed_at = NOW()
        WHERE id = $4
      `, [itemsImported, itemsFailed, itemsFailed > 0 ? 'completed' : 'completed', mappingId])
      
      boardsProcessed++
      console.log(` ✓ Imported ${itemsImported} items`)
      
    } catch (err: any) {
      console.error(` ✗ Failed:`, err.message)
      totalFailed += board.items_count || 0
    }
  }
  
  // Update session
  await query(`
    UPDATE monday_migration_sessions
    SET status = $1, items_migrated = $2, items_failed = $3, completed_at = NOW()
    WHERE id = $4
  `, [totalFailed > 0 ? 'partial' : 'completed', totalImported, totalFailed, sessionId])
  
  console.log('\n\n✅ Migration Complete!')
  console.log(`   Boards: ${boardsProcessed}`)
  console.log(`   Items Imported: ${totalImported}`)
  console.log(`   Items Failed: ${totalFailed}`)
  
  process.exit(0)
}

async function importItem(client: any, item: any, boardId: string, departmentId: string, mappingId: string) {
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

runMigration().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
