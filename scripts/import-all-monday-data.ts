/**
 * Comprehensive Monday.com Import
 * Imports ALL boards with tasks, subitems, and related data
 */

import { createMondayClient } from '../server/utils/mondayClient'
import { queryOne, queryRows, execute } from '../server/utils/db'

async function importAllData() {
  console.log('🚀 Starting comprehensive Monday.com import...\n')
  
  try {
    const client = await createMondayClient()
    
    // Get all boards
    console.log('📋 Fetching boards from Monday.com...')
    const boards = await client.getBoards({ limit: 500 })
    console.log(`✅ Found ${boards.length} boards\n`)
    
    // Get existing department slugs
    const existingDepts = await queryRows('SELECT slug, id FROM departments')
    const deptMap = new Map(existingDepts.map(d => [d.slug, d.id]))
    
    console.log(`📊 ${existingDepts.length} departments already in database\n`)
    
    let totalImported = 0
    let totalUpdated = 0
    let totalFailed = 0
    
    // Process boards in batches
    for (let i = 0; i < boards.length; i++) {
      const board = boards[i]
      
      if (board.state !== 'active') continue
      
      console.log(`\n[${i + 1}/${boards.length}] 📥 ${board.name}`)
      
      try {
        // Get or create department
        const slug = board.name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
        
        let deptId = deptMap.get(slug)
        
        if (!deptId) {
          const newDept = await queryOne(
            `INSERT INTO departments (name, slug, color, description, is_active)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id`,
            [board.name, slug, '#579BFC', `Imported from Monday.com (ID: ${board.id})`]
          )
          deptId = newDept!.id
          deptMap.set(slug, deptId)
        }
        
        // Check if this department already has tasks
        const existingTasks = await queryOne(
          'SELECT COUNT(*) as count FROM tasks WHERE department_id = $1',
          [deptId]
        )
        
        if (parseInt(existingTasks!.count) > 0) {
          process.stdout.write(`   ✓ Already has ${existingTasks!.count} tasks, skipping`)
          continue
        }
        
        // Create default statuses
        await createDefaultStatuses(deptId)
        
        // Get default status
        const defaultStatus = await queryOne(
          `SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1`,
          [deptId]
        )
        const statusId = defaultStatus?.id
        
        if (!statusId) {
          console.log('   ⚠️ No status found')
          continue
        }
        
        // Fetch items
        const itemsResult = await client.getItems(board.id, { limit: 500 })
        const items = itemsResult.items
        
        process.stdout.write(`   📦 ${items.length} items → `)
        
        let imported = 0
        let failed = 0
        
        for (const item of items) {
          try {
            // Extract data from columns
            let dueDate = null
            let priority = 'medium'
            let assigneeId = null
            
            for (const col of item.column_values || []) {
              if (col.type === 'date' && col.value) {
                try {
                  const parsed = JSON.parse(col.value)
                  dueDate = parsed?.date
                } catch {}
              }
              else if (col.type === 'status' && col.value) {
                try {
                  const parsed = JSON.parse(col.value)
                  const label = parsed?.label?.text?.toLowerCase() || ''
                  if (label.includes('urgent') || label.includes('critical')) priority = 'urgent'
                  else if (label.includes('high')) priority = 'high'
                  else if (label.includes('low')) priority = 'low'
                } catch {}
              }
              else if (col.type === 'people' && col.value) {
                try {
                  const parsed = JSON.parse(col.value)
                  const personId = parsed?.personsAndTeams?.[0]?.id
                  if (personId) {
                    const member = await queryOne(
                      'SELECT id FROM team_members WHERE monday_user_id = $1 LIMIT 1',
                      [personId.toString()]
                    )
                    if (member) assigneeId = member.id
                  }
                } catch {}
              }
            }
            
            // Create task
            const task = await queryOne(
              `INSERT INTO tasks 
               (department_id, status_id, title, priority, assignee_id, due_date, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id`,
              [deptId, statusId, item.name, priority, assigneeId, dueDate, item.created_at, item.updated_at]
            )
            
            // Create Monday mapping
            await execute(
              `INSERT INTO monday_item_mappings 
               (monday_item_id, monday_item_name, monday_board_id, task_id, source_data, status)
               VALUES ($1, $2, $3, $4, $5, 'completed')
               ON CONFLICT (monday_item_id) DO UPDATE SET
                 task_id = EXCLUDED.task_id,
                 updated_at = NOW()`,
              [item.id, item.name, board.id, task!.id, JSON.stringify(item)]
            ).catch(() => {})
            
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
                   value_json = EXCLUDED.value_json`,
                [task!.id, col.id, col.title || col.id, col.type, col.text, jsonValue]
              ).catch(() => {})
            }
            
            imported++
          } catch (err) {
            failed++
          }
        }
        
        process.stdout.write(`✓ Imported: ${imported}, Failed: ${failed}`)
        totalImported += imported
        totalFailed += failed
        
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`)
        totalFailed++
      }
    }
    
    console.log(`\n\n🎉 Import Complete!`)
    console.log(`===================`)
    console.log(`Total Imported: ${totalImported}`)
    console.log(`Total Failed: ${totalFailed}`)
    console.log(`\nView boards at: /agency/boards`)
    
  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message)
    process.exit(1)
  }
}

async function createDefaultStatuses(deptId: string) {
  const existing = await queryOne(
    'SELECT COUNT(*) as count FROM task_statuses WHERE department_id = $1',
    [deptId]
  )
  
  if (parseInt(existing!.count) > 0) return
  
  const statuses = [
    { name: 'To Do', slug: 'to-do', color: '#C4C4C4', category: 'not_started', is_default: true, sort_order: 1 },
    { name: 'In Progress', slug: 'in-progress', color: '#579BFC', category: 'in_progress', is_default: false, sort_order: 2 },
    { name: 'Review', slug: 'review', color: '#FFCC00', category: 'review', is_default: false, sort_order: 3 },
    { name: 'Done', slug: 'done', color: '#00C875', category: 'done', is_default: false, sort_order: 4 },
  ]
  
  for (const s of statuses) {
    await execute(
      `INSERT INTO task_statuses 
       (department_id, name, slug, color, category, is_default, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [deptId, s.name, s.slug, s.color, s.category, s.is_default, s.sort_order]
    )
  }
}

importAllData()
