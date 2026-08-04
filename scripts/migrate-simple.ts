import { createMondayClient } from '../server/utils/mondayClient'
import { query, transaction } from '../server/utils/db'

const TOKEN = process.env.MONDAY_API_TOKEN

if (!TOKEN) {
  throw new Error('MONDAY_API_TOKEN is required')
}

async function migrate() {
  console.log('Starting migration...\n')
  
  const client = await createMondayClient(TOKEN)
  
  // Get Marketing department
  const deptResult = await query("SELECT id FROM departments WHERE slug = 'marketing' LIMIT 1")
  const deptId = deptResult.rows[0]?.id
  if (!deptId) {
    console.error('Marketing department not found')
    return
  }
  
  // Get default status
  const statusResult = await query("SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1", [deptId])
  const statusId = statusResult.rows[0]?.id
  
  // Get Social Media board items
  console.log('Fetching Social Media board...')
  let cursor: string | undefined
  let count = 0
  
  do {
    const page = await client.getItems('9550690085', { limit: 100, cursor })
    
    for (const item of page.items) {
      try {
        await transaction(async (trx) => {
          const colValues = item.column_values || []
          const dateCol = colValues.find((c: any) => c.type === 'date')
          const dueDate = dateCol?.text || null
          
          await trx.query(`
            INSERT INTO tasks (department_id, status_id, title, due_date, priority, task_type, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `, [deptId, statusId, item.name, dueDate, 'medium', 'task'])
        })
        count++
        process.stdout.write('.')
      } catch (err) {
        process.stdout.write('x')
      }
    }
    
    cursor = page.cursor
    console.log(`\n  Imported ${count} items so far...`)
  } while (cursor)
  
  console.log(`\n✅ Done! Imported ${count} items from Social Media board`)
}

migrate().catch(console.error)
