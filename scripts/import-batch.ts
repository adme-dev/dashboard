/**
 * Batch import Monday.com boards quickly
 * Usage: npx tsx scripts/import-batch.ts "Board 1" "Board 2" "Board 3"
 */

import { createMondayClient } from '../server/utils/mondayClient'
import { queryOne, execute } from '../server/utils/db'

const targetBoards = process.argv.slice(2)

if (targetBoards.length === 0) {
  console.log('Usage: npx tsx scripts/import-batch.ts "Board 1" "Board 2" ...')
  process.exit(1)
}

async function importBatch() {
  console.log(`🚀 Importing ${targetBoards.length} boards...\n`)
  
  try {
    const client = await createMondayClient()
    const boards = await client.getBoards({ limit: 500 })
    
    let totalImported = 0
    let totalFailed = 0
    
    for (const targetName of targetBoards) {
      const board = boards.find(b => 
        b.name.toLowerCase().includes(targetName.toLowerCase()) ||
        targetName.toLowerCase().includes(b.name.toLowerCase())
      )
      
      if (!board) {
        console.log(`❌ "${targetName}" not found`)
        continue
      }
      
      process.stdout.write(`📥 ${board.name}... `)
      
      try {
        // Get/create department
        const slug = board.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        let dept = await queryOne('SELECT id FROM departments WHERE slug = $1', [slug])
        
        if (!dept) {
          dept = await queryOne(
            `INSERT INTO departments (name, slug, color, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
            [board.name, slug, '#579BFC']
          )
        }
        
        const deptId = dept!.id
        
        // Check for existing tasks
        const existing = await queryOne('SELECT COUNT(*) as count FROM tasks WHERE department_id = $1', [deptId])
        if (parseInt(existing!.count) > 0) {
          console.log(`✓ (${existing!.count} already)`)
          continue
        }
        
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
        
        // Fetch items
        const itemsResult = await client.getItems(board.id, { limit: 500 })
        const items = itemsResult.items
        
        let imported = 0
        for (const item of items) {
          try {
            const task = await queryOne(
              `INSERT INTO tasks (department_id, status_id, title, priority, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [deptId, defaultStatus!.id, item.name, 'medium', item.created_at, item.updated_at]
            )
            
            await execute(
              `INSERT INTO monday_item_mappings (monday_item_id, monday_item_name, monday_board_id, task_id, source_data, status)
               VALUES ($1, $2, $3, $4, $5, 'completed') ON CONFLICT (monday_item_id) DO UPDATE SET task_id = EXCLUDED.task_id`,
              [item.id, item.name, board.id, task!.id, JSON.stringify(item)]
            ).catch(() => {})
            
            imported++
          } catch {}
        }
        
        console.log(`✓ ${imported} items`)
        totalImported += imported
        
      } catch (err: any) {
        console.log(`❌ ${err.message}`)
        totalFailed++
      }
    }
    
    console.log(`\n🎉 Done! Imported ${totalImported} tasks`)
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

importBatch()
