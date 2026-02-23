/**
 * Import specific Monday.com board
 * Usage: npx tsx scripts/import-specific-board.ts "Board Name"
 */

import { createMondayClient } from '../server/utils/mondayClient'
import { queryOne, execute } from '../server/utils/db'

const targetBoard = process.argv[2] || 'Interrail Platform'

async function importBoard() {
  console.log(`🚀 Importing "${targetBoard}" from Monday.com...\n`)
  
  try {
    const client = await createMondayClient()
    
    // Find the board
    console.log('📋 Finding board...')
    const boards = await client.getBoards({ limit: 500 })
    const board = boards.find(b => 
      b.name.toLowerCase().includes(targetBoard.toLowerCase()) ||
      targetBoard.toLowerCase().includes(b.name.toLowerCase())
    )
    
    if (!board) {
      console.log(`❌ Board "${targetBoard}" not found`)
      console.log('\nAvailable boards:')
      boards
        .filter(b => b.state === 'active')
        .slice(0, 20)
        .forEach(b => console.log(`  - ${b.name}`))
      process.exit(1)
    }
    
    console.log(`✅ Found: ${board.name} (ID: ${board.id})`)
    
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
      console.log(`🏢 Created department: ${board.name}`)
    } else {
      console.log(`🏢 Using existing department: ${board.name}`)
    }
    
    const deptId = dept!.id
    
    // Create default statuses if not exist
    const existingStatuses = await queryOne(
      'SELECT COUNT(*) as count FROM task_statuses WHERE department_id = $1',
      [deptId]
    )
    
    if (parseInt(existingStatuses!.count) === 0) {
      console.log('📊 Creating default statuses...')
      const defaultStatuses = [
        { name: 'To Do', slug: 'to-do', color: '#C4C4C4', category: 'not_started', is_default: true, sort_order: 1 },
        { name: 'In Progress', slug: 'in-progress', color: '#579BFC', category: 'in_progress', is_default: false, sort_order: 2 },
        { name: 'Review', slug: 'review', color: '#FFCC00', category: 'review', is_default: false, sort_order: 3 },
        { name: 'Done', slug: 'done', color: '#00C875', category: 'done', is_default: false, sort_order: 4 },
      ]
      
      for (const s of defaultStatuses) {
        await execute(
          `INSERT INTO task_statuses 
           (department_id, name, slug, color, category, is_default, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [deptId, s.name, s.slug, s.color, s.category, s.is_default, s.sort_order]
        )
      }
    }
    
    // Get default status
    const defaultStatus = await queryOne(
      `SELECT id FROM task_statuses 
       WHERE department_id = $1 AND is_default = true
       LIMIT 1`,
      [deptId]
    )
    const statusId = defaultStatus!.id
    
    // Get items from board
    console.log('📦 Fetching items...')
    const itemsResult = await client.getItems(board.id, { limit: 500 })
    const items = itemsResult.items
    
    console.log(`📦 Found ${items.length} items`)
    
    let imported = 0
    let updated = 0
    let failed = 0
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      // Show progress every 10 items
      if (i % 10 === 0) {
        process.stdout.write(`\r   Progress: ${i}/${items.length} (Imported: ${imported}, Updated: ${updated}, Failed: ${failed})`)
      }
      
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
          updated++
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
          imported++
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
      } catch (err: any) {
        failed++
        if (failed <= 3) {
          console.error(`\n   ⚠️  Failed: ${err.message}`)
        }
      }
    }
    
    console.log(`\n   ✅ Done! Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`)
    console.log(`\n🎉 Board "${board.name}" ready at: /agency/boards/${slug}`)
    
  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message)
    process.exit(1)
  }
}

importBoard()
