#!/usr/bin/env tsx
/**
 * Quick Migration of Key Monday.com Boards
 * Imports the most important boards with items
 */

import { createMondayClient } from '../server/utils/mondayClient'
import { query, transaction } from '../server/utils/db'

const TOKEN = process.env.MONDAY_API_TOKEN!

// Key boards to migrate (board ID -> department slug)
const KEY_BOARDS = [
  { id: '9550690085', name: 'Social Media', dept: 'marketing' },
  { id: '18399213229', name: 'FTG Automotive Feb 2026', dept: 'marketing' },
  { id: '18399153106', name: 'FTG Automotive', dept: 'marketing' },
  { id: '18399211942', name: 'SEO Framework', dept: 'marketing' },
  { id: '18230429150', name: 'All Client Inventory Feeds', dept: 'creative' },
  { id: '9970935150', name: 'Project Task Manager', dept: 'sales' },
]

async function migrate() {
  console.log('🚀 Starting Key Boards Migration...\n')
  
  const client = await createMondayClient(TOKEN)
  
  // Get departments
  const deptsResult = await query('SELECT id, slug FROM departments WHERE is_active = true')
  const depts = deptsResult.rows
  
  let totalImported = 0
  let totalFailed = 0
  
  for (const boardConfig of KEY_BOARDS) {
    const dept = depts.find((d: any) => d.slug === boardConfig.dept)
    if (!dept) {
      console.log(`⚠️ Department not found for ${boardConfig.name}`)
      continue
    }
    
    // Get default status for department
    const statusResult = await query(
      'SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1',
      [dept.id]
    )
    const statusId = statusResult.rows[0]?.id
    
    console.log(`\n📌 ${boardConfig.name} → ${boardConfig.dept}`)
    
    try {
      // Get all items from board
      let cursor: string | undefined
      let imported = 0
      let failed = 0
      
      do {
        const page = await client.getItems(boardConfig.id, { limit: 100, cursor })
        
        for (const item of page.items) {
          try {
            await transaction(async (trx) => {
              const colValues = item.column_values || []
              const dateCol = colValues.find((c: any) => c.type === 'date')
              const dueDate = dateCol?.text || null
              
              await trx.query(`
                INSERT INTO tasks (department_id, status_id, title, due_date, priority, task_type, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
              `, [dept.id, statusId, item.name, dueDate, 'medium', 'task'])
            })
            imported++
            process.stdout.write('.')
          } catch (err) {
            failed++
            process.stdout.write('x')
          }
        }
        
        cursor = page.cursor
      } while (cursor)
      
      console.log(` ✓ ${imported} items`)
      totalImported += imported
      totalFailed += failed
      
    } catch (err: any) {
      console.error(` ✗ Error: ${err.message}`)
    }
  }
  
  console.log('\n\n✅ Migration Complete!')
  console.log(`   Total Imported: ${totalImported}`)
  console.log(`   Total Failed: ${totalFailed}`)
  
  // Show final counts
  const result = await query(`
    SELECT d.name, COUNT(t.id) as tasks 
    FROM tasks t 
    JOIN departments d ON t.department_id = d.id 
    GROUP BY d.name 
    ORDER BY tasks DESC
  `)
  
  console.log('\n📊 Tasks by Department:')
  for (const row of result.rows) {
    console.log(`   ${row.name}: ${row.tasks}`)
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
