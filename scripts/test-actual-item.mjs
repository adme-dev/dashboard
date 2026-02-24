/**
 * Test with an actual Monday.com item to find the exact failure
 * Run: node scripts/test-actual-item.mjs
 */

import { Pool } from '@neondatabase/serverless'

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_61XeGcIwAORL@ep-lively-fog-a4dum154-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
})

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN

async function fetchMondayItems(boardId) {
  const resp = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Authorization': MONDAY_TOKEN,
      'Content-Type': 'application/json',
      'API-Version': '2024-01',
    },
    body: JSON.stringify({
      query: `query { boards(ids: ["${boardId}"]) { items_page(limit: 3) { items { id name state created_at updated_at group { id title } column_values { id type value text } } } } }`
    })
  })
  const data = await resp.json()
  if (data.errors) {
    console.log('API Errors:', data.errors)
    return []
  }
  return data.data?.boards?.[0]?.items_page?.items || []
}

async function main() {
  if (!MONDAY_TOKEN) {
    console.log('MONDAY_API_TOKEN not set, reading from .env...')
    const fs = await import('fs')
    const envContent = fs.readFileSync('.env', 'utf-8')
    const match = envContent.match(/MONDAY_API_TOKEN=(.+)/)
    if (match) {
      process.env.MONDAY_API_TOKEN = match[1].trim()
    } else {
      console.log('ERROR: No MONDAY_API_TOKEN found in .env')
      process.exit(1)
    }
  }

  // Get MCP Getting Started board (small, 1 item)
  // First, list boards to find a small one
  console.log('=== FETCHING BOARDS FROM MONDAY.COM ===')
  const boardsResp = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Authorization': process.env.MONDAY_API_TOKEN,
      'Content-Type': 'application/json',
      'API-Version': '2024-01',
    },
    body: JSON.stringify({
      query: `query { boards(limit: 5) { id name items_count } }`
    })
  })
  const boardsData = await boardsResp.json()
  const boards = boardsData.data?.boards || []
  console.log('First 5 boards:')
  for (const b of boards) {
    console.log(`  ${b.name} (id: ${b.id}, items: ${b.items_count})`)
  }

  // Pick the first board with items
  const testBoard = boards.find(b => b.items_count > 0) || boards[0]
  console.log(`\nUsing board: ${testBoard.name} (${testBoard.id})`)

  // Fetch items
  console.log('\n=== FETCHING ITEMS ===')
  const items = await fetchMondayItems(testBoard.id)
  console.log(`Got ${items.length} items`)

  if (items.length === 0) {
    console.log('No items found')
    await pool.end()
    return
  }

  const item = items[0]
  console.log(`\nTest item: ${item.name} (id: ${item.id})`)
  console.log(`  created_at: ${item.created_at} (type: ${typeof item.created_at})`)
  console.log(`  updated_at: ${item.updated_at} (type: ${typeof item.updated_at})`)
  console.log(`  state: ${item.state}`)
  console.log(`  group: ${item.group?.title} (${item.group?.id})`)
  console.log(`  column_values: ${item.column_values?.length} columns`)

  // Replicate the exact migration INSERT
  const departmentId = '8da06179-933c-4c09-a3c2-a697bc205a8c'

  // Get status
  const status = await pool.query('SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1', [departmentId])
  const statusId = status.rows[0]?.id
  console.log(`\nStatus ID: ${statusId}`)

  // Extract dates like migration does
  const dateColumn = item.column_values?.find(cv => cv.type === 'date')
  let dueDate = null
  if (dateColumn?.value) {
    try {
      const parsed = JSON.parse(dateColumn.value)
      dueDate = parsed?.date
    } catch {}
  }

  const timelineColumn = item.column_values?.find(cv => cv.type === 'timeline')
  let startDate = null
  if (timelineColumn?.value) {
    try {
      const parsed = JSON.parse(timelineColumn.value)
      startDate = parsed?.from
      dueDate = parsed?.to
    } catch {}
  }

  // Extract priority
  let priority = 'medium'

  // Extract description
  const longTextColumn = item.column_values?.find(cv => cv.type === 'long_text')
  const description = longTextColumn?.text || null

  // Extract estimated hours
  const numbersColumn = item.column_values?.find(cv => cv.type === 'numbers')
  let estimatedHours = null
  if (numbersColumn?.text) {
    const h = parseFloat(numbersColumn.text)
    if (!isNaN(h) && h > 0 && h < 1000) estimatedHours = h
  }

  console.log('\n=== TESTING INSERT WITH ACTUAL ITEM DATA ===')
  const params = [
    null, // project_id
    departmentId,
    statusId,
    (item.name || 'Untitled').substring(0, 255),
    description,
    priority,
    null, // assignee_id
    dueDate || null,
    startDate || null,
    estimatedHours,
    item.created_at || new Date().toISOString(),
    item.updated_at || new Date().toISOString(),
  ]
  console.log('Parameters:')
  params.forEach((p, i) => console.log(`  $${i + 1}: ${JSON.stringify(p)} (${typeof p})`))

  try {
    const result = await pool.query(
      `INSERT INTO tasks
       (project_id, department_id, status_id, title, description, priority, assignee_id, due_date, start_date, estimated_hours, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      params
    )
    console.log(`\nSUCCESS: task id = ${result.rows[0].id}`)
    // Clean up
    await pool.query('DELETE FROM tasks WHERE id = $1', [result.rows[0].id])
    console.log('Cleaned up')
  } catch (err) {
    console.log(`\nFAILED: ${err.message}`)
    console.log(`Detail: ${err.detail}`)
    console.log(`Code: ${err.code}`)
    console.log(`Constraint: ${err.constraint}`)
  }

  // Now test the item mapping INSERT
  console.log('\n=== TESTING ITEM MAPPING INSERT ===')
  const bm = await pool.query('SELECT id, migration_session_id FROM monday_board_mappings ORDER BY created_at DESC LIMIT 1')
  if (bm.rows[0]) {
    try {
      const mappingParams = [
        bm.rows[0].migration_session_id,
        bm.rows[0].id,
        item.id,
        (item.name || '').substring(0, 500),
        JSON.stringify(item),
        'failed',
        'test error from diagnostic'
      ]
      console.log('Parameters:')
      mappingParams.forEach((p, i) => console.log(`  $${i + 1}: ${typeof p === 'string' && p.length > 100 ? p.substring(0, 100) + '...' : JSON.stringify(p)}`))

      const mResult = await pool.query(
        `INSERT INTO monday_item_mappings
         (migration_session_id, board_mapping_id, monday_item_id, monday_item_name, source_data, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (migration_session_id, monday_item_id) DO UPDATE SET status = $6, error_message = $7
         RETURNING id`,
        mappingParams
      )
      console.log(`SUCCESS: mapping id = ${mResult.rows[0].id}`)
      await pool.query('DELETE FROM monday_item_mappings WHERE id = $1', [mResult.rows[0].id])
      console.log('Cleaned up')
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
      console.log(`Detail: ${err.detail}`)
      console.log(`Code: ${err.code}`)
    }
  }

  await pool.end()
}

main().catch(err => {
  console.error('Script error:', err)
  process.exit(1)
})
