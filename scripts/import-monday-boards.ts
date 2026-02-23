/**
 * Direct Monday.com Import Script
 * Run: npx tsx scripts/import-monday-boards.ts
 */

import { createMondayClient } from '../server/utils/mondayClient'
import { queryOne, queryRows, execute } from '../server/utils/db'

async function importAllBoards() {
  console.log('🚀 Starting Monday.com import...\n')
  
  try {
    const client = await createMondayClient()
    
    // Get all boards
    console.log('📋 Fetching boards from Monday.com...')
    const boards = await client.getBoards({ limit: 500 })
    console.log(`✅ Found ${boards.length} boards\n`)
    
    // Display boards
    boards.forEach((b, i) => {
      console.log(`${i + 1}. ${b.name} (ID: ${b.id}, Items: ${b.items_count || '?'}, State: ${b.state})`)
    })
    
    // Import each board
    for (const board of boards) {
      if (board.state !== 'active') {
        console.log(`\n⏭️  Skipping "${board.name}" (not active)`)
        continue
      }
      
      await importBoard(client, board)
    }
    
    console.log('\n🎉 Import completed!')
    
  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message)
    process.exit(1)
  }
}

async function importBoard(client: any, board: any) {
  console.log(`\n📥 Importing "${board.name}"...`)
  
  try {
    // Get or create department
    const slug = board.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    
    let dept = await queryOne(
      'SELECT id FROM departments WHERE slug = $1',
      [slug]
    )
    
    if (!dept) {
      dept = await queryOne(
        `INSERT INTO departments (name, slug, color, description, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [
          board.name,
          slug,
          '#579BFC',
          `Imported from Monday.com board (ID: ${board.id})`
        ]
      )
      console.log(`   🏢 Created department: ${board.name}`)
    } else {
      console.log(`   🏢 Using existing department: ${board.name}`)
    }
    
    const deptId = dept!.id
    
    // Get default status
    const defaultStatus = await queryOne(
      `SELECT id FROM task_statuses 
       WHERE department_id = $1 
       ORDER BY is_default DESC, sort_order 
       LIMIT 1`,
      [deptId]
    )
    
    if (!defaultStatus) {
      console.log(`   ⚠️  No status found for department, skipping...`)
      return
    }
    
    const statusId = defaultStatus.id
    
    // Get items from board
    const itemsResult = await client.getItems(board.id, { limit: 500 })
    const items = itemsResult.items
    
    console.log(`   📦 Found ${items.length} items`)
    
    let imported = 0
    let failed = 0
    
    for (const item of items) {
      try {
        // Check if already exists
        const existing = await queryOne(
          `SELECT task_id FROM monday_item_mappings 
           WHERE monday_item_id = $1`,
          [item.id]
        )
        
        // Extract due date
        let dueDate = null
        const dateCol = item.column_values?.find((c: any) => c.type === 'date')
        if (dateCol?.value) {
          try {
            const parsed = JSON.parse(dateCol.value)
            dueDate = parsed?.date
          } catch {}
        }
        
        // Extract priority
        let priority = 'medium'
        const statusCol = item.column_values?.find((c: any) => c.type === 'status')
        if (statusCol?.value) {
          try {
            const parsed = JSON.parse(statusCol.value)
            const label = parsed?.label?.text?.toLowerCase() || ''
            if (label.includes('urgent') || label.includes('critical')) priority = 'urgent'
            else if (label.includes('high')) priority = 'high'
            else if (label.includes('low')) priority = 'low'
          } catch {}
        }
        
        let taskId: string
        
        if (existing?.task_id) {
          // Update existing
          await execute(
            `UPDATE tasks SET
              title = $1,
              priority = $2,
              due_date = $3,
              updated_at = NOW()
             WHERE id = $4`,
            [item.name, priority, dueDate, existing.task_id]
          )
          taskId = existing.task_id
        } else {
          // Create new task
          const newTask = await queryOne(
            `INSERT INTO tasks 
             (department_id, status_id, title, priority, due_date, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [deptId, statusId, item.name, priority, dueDate, item.created_at, item.updated_at]
          )
          taskId = newTask!.id
          
          // Create mapping
          await execute(
            `INSERT INTO monday_item_mappings 
             (monday_item_id, monday_item_name, monday_board_id, task_id, source_data, status)
             VALUES ($1, $2, $3, $4, $5, 'completed')
             ON CONFLICT (monday_item_id) DO UPDATE SET
               task_id = EXCLUDED.task_id,
               updated_at = NOW()`,
            [item.id, item.name, board.id, taskId, JSON.stringify(item)]
          )
        }
        
        // Store column values
        if (item.column_values) {
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
               ON CONFLICT (task_id, monday_column_id) DO UPDATE SET
                 text_value = EXCLUDED.text_value,
                 value_json = EXCLUDED.value_json,
                 migrated_at = NOW()`,
              [taskId, col.id, col.title || col.id, col.type, col.text, jsonValue]
            ).catch(() => {})
          }
        }
        
        imported++
      } catch (err: any) {
        failed++
        if (failed <= 3) {
          console.log(`   ⚠️  Failed to import item ${item.id}: ${err.message}`)
        }
      }
    }
    
    console.log(`   ✅ Imported: ${imported}, Failed: ${failed}`)
    
  } catch (error: any) {
    console.error(`   ❌ Error importing board: ${error.message}`)
  }
}

// Run import
importAllBoards()
