/**
 * Import a Monday.com board with full group and column data
 * Usage: npx tsx scripts/import-board-with-groups.ts "Board Name"
 */

import { createMondayClient } from '../server/utils/mondayClient'
import { queryOne, execute } from '../server/utils/db'

const targetBoard = process.argv[2] || 'Support'

async function importBoardWithGroups() {
  console.log(`🚀 Importing "${targetBoard}" with full group data...\n`)
  
  try {
    const client = await createMondayClient()
    
    // Find the board - exact match first, then partial
    const boards = await client.getBoards({ limit: 500 })
    let board = boards.find(b => b.name.toLowerCase() === targetBoard.toLowerCase())
    
    if (!board) {
      board = boards.find(b => b.name.toLowerCase().includes(targetBoard.toLowerCase()))
    }
    
    if (!board) {
      console.log(`❌ Board "${targetBoard}" not found`)
      return
    }
    
    console.log(`✅ Found: ${board.name} (ID: ${board.id})`)
    console.log(`📁 Groups: ${board.groups?.map((g: any) => g.title).join(', ')}\n`)
    
    // Get/create department
    const slug = board.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    let dept = await queryOne('SELECT id FROM departments WHERE slug = $1', [slug])
    
    if (!dept) {
      dept = await queryOne(
        `INSERT INTO departments (name, slug, color, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
        [board.name, slug, '#579BFC']
      )
      console.log(`🏢 Created department: ${board.name}`)
    } else {
      console.log(`🏢 Using department: ${board.name}`)
    }
    
    const deptId = dept!.id
    
    // Create statuses
    const statuses = [
      { name: 'To Do', slug: 'to-do', color: '#C4C4C4', category: 'not_started', is_default: true, sort: 1 },
      { name: 'In Progress', slug: 'in-progress', color: '#579BFC', category: 'in_progress', is_default: false, sort: 2 },
      { name: 'Done', slug: 'done', color: '#00C875', category: 'done', is_default: false, sort: 3 },
    ]
    for (const s of statuses) {
      await execute(
        `INSERT INTO task_statuses (department_id, name, slug, color, category, is_default, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [deptId, s.name, s.slug, s.color, s.category, s.is_default, s.sort]
      )
    }
    
    const defaultStatus = await queryOne(
      'SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1',
      [deptId]
    )
    
    // Fetch items with all details
    console.log('📦 Fetching items with groups and columns...')
    const itemsResult = await client.getItems(board.id, { limit: 500 })
    const items = itemsResult.items
    
    console.log(`📦 Found ${items.length} items\n`)
    
    let imported = 0
    let updated = 0
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      if (i % 10 === 0) {
        process.stdout.write(`\r   Progress: ${i}/${items.length} (Imported: ${imported}, Updated: ${updated})`)
      }
      
      try {
        // Check if exists
        const existing = await queryOne(
          'SELECT task_id FROM monday_item_mappings WHERE monday_item_id = $1',
          [item.id]
        )
        
        // Extract due date from columns
        let dueDate = null
        const dateCol = item.column_values?.find((c: any) => c.type === 'date')
        if (dateCol?.value) {
          try {
            const parsed = JSON.parse(dateCol.value)
            dueDate = parsed?.date
          } catch {}
        }
        
        // Extract priority from status
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
          // Update
          await execute(
            `UPDATE tasks SET title = $1, priority = $2, due_date = $3, updated_at = NOW() WHERE id = $4`,
            [item.name, priority, dueDate, existing.task_id]
          )
          taskId = existing.task_id
          updated++
        } else {
          // Create
          const newTask = await queryOne(
            `INSERT INTO tasks (department_id, status_id, title, priority, due_date, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [deptId, defaultStatus!.id, item.name, priority, dueDate, item.created_at, item.updated_at]
          )
          taskId = newTask!.id
          
          // Create mapping with full source data including group
          await execute(
            `INSERT INTO monday_item_mappings 
             (monday_item_id, monday_item_name, monday_board_id, task_id, source_data, status)
             VALUES ($1, $2, $3, $4, $5, 'completed')
             ON CONFLICT (monday_item_id) DO UPDATE SET
               source_data = EXCLUDED.source_data,
               updated_at = NOW()`,
            [item.id, item.name, board.id, taskId, JSON.stringify({
              ...item,
              group: item.group // Include group info
            })]
          )
          imported++
        }
        
        // Store column values
        for (const col of item.column_values || []) {
          let jsonValue = null
          if (col.value) {
            try { jsonValue = JSON.parse(col.value) } 
            catch { jsonValue = { text: col.value } }
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
        
      } catch (err) {
        // Skip errors
      }
    }
    
    console.log(`\n   ✅ Done! Imported: ${imported}, Updated: ${updated}\n`)
    console.log(`🎉 View at: /agency/boards/${slug}`)
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

importBoardWithGroups()
