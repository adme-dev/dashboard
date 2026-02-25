/**
 * Resume migration for remaining boards (15 boards: 1 stuck + 14 never started)
 * Uses smaller batch inserts and connection recovery to avoid Neon WebSocket drops
 *
 * Run: node scripts/resume-migration.mjs
 */

import { Pool } from '@neondatabase/serverless'
import { readFileSync } from 'fs'

// Load env
const envContent = readFileSync('.env', 'utf-8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
)

const DB_URL = env.DATABASE_URL
const MONDAY_TOKEN = env.MONDAY_API_TOKEN
const DEPARTMENT_ID = '8da06179-933c-4c09-a3c2-a697bc205a8c'
const SESSION_ID = '4e956716-8669-4513-ab65-b91dfda6ef47'

// Create pool with conservative settings to avoid connection exhaustion
let pool = new Pool({ connectionString: DB_URL })

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Reconnect pool if connection drops
async function getPool() {
  try {
    await pool.query('SELECT 1')
    return pool
  } catch {
    console.log('  Reconnecting pool...')
    try { await pool.end() } catch {}
    pool = new Pool({ connectionString: DB_URL })
    return pool
  }
}

async function dbQuery(sql, params) {
  const p = await getPool()
  const result = await p.query(sql, params)
  return result.rows
}
async function dbOne(sql, params) {
  const rows = await dbQuery(sql, params)
  return rows[0] || null
}
async function dbExec(sql, params) {
  const p = await getPool()
  const result = await p.query(sql, params)
  return result.rowCount || 0
}

async function mondayQuery(query, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': MONDAY_TOKEN,
          'Content-Type': 'application/json',
          'API-Version': '2024-01',
        },
        body: JSON.stringify({ query })
      })
      const data = await resp.json()
      if (data.errors?.length) {
        const err = data.errors[0]
        if (err.message?.includes('429') || err.extensions?.code === 'RATE_LIMITED') {
          if (attempt < retries) {
            const delay = Math.pow(2, attempt + 1) * 1000
            console.log(`  Rate limited, waiting ${delay / 1000}s...`)
            await sleep(delay)
            continue
          }
        }
        throw new Error(`Monday API: ${err.message || JSON.stringify(err)}`)
      }
      return data.data
    } catch (err) {
      if (attempt < retries && (err.message?.includes('429') || err.message?.includes('ECONNRESET'))) {
        await sleep(Math.pow(2, attempt + 1) * 1000)
        continue
      }
      throw err
    }
  }
}

function extractColumnValues(item) {
  const values = {}
  for (const col of item.column_values || []) {
    try {
      if (col.value) values[col.id] = JSON.parse(col.value)
      else values[col.id] = col.text
    } catch {
      values[col.id] = col.text
    }
  }
  return values
}

async function main() {
  console.log('=== Resume Monday.com Migration ===')
  console.log(`Session: ${SESSION_ID}`)

  // Get default status
  const statusId = (await dbOne('SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1', [DEPARTMENT_ID]))?.id
  console.log(`Default status: ${statusId}`)

  // Get already-migrated board IDs
  const migratedBoards = await dbQuery(
    'SELECT monday_board_id FROM monday_board_mappings WHERE migration_session_id = $1',
    [SESSION_ID]
  )
  const migratedBoardIds = new Set(migratedBoards.map(b => b.monday_board_id))
  console.log(`Already migrated: ${migratedBoardIds.size} boards`)

  // Reset the stuck "Website Builds" board
  await dbExec(
    `UPDATE monday_board_mappings SET status = 'pending', items_migrated = 0, items_failed = 0
     WHERE migration_session_id = $1 AND status = 'migrating'`,
    [SESSION_ID]
  )

  // Fetch all boards from Monday.com
  let allBoards = []
  let page = 1
  while (true) {
    const data = await mondayQuery(`query { boards(limit: 100, page: ${page}) { id name type state items_count } }`)
    const boards = data.boards || []
    if (boards.length === 0) break
    allBoards = allBoards.concat(boards.filter(b => b.state === 'active'))
    page++
    if (boards.length < 100) break
  }

  // Filter to only boards we haven't fully completed
  const completedIds = new Set(
    (await dbQuery(
      "SELECT monday_board_id FROM monday_board_mappings WHERE migration_session_id = $1 AND status = 'completed'",
      [SESSION_ID]
    )).map(b => b.monday_board_id)
  )

  const remainingBoards = allBoards.filter(b => !completedIds.has(b.id))
  console.log(`Remaining boards to process: ${remainingBoards.length}`)

  let totalMigrated = 0
  let totalFailed = 0

  for (let i = 0; i < remainingBoards.length; i++) {
    const board = remainingBoards[i]
    const boardNum = `[${i + 1}/${remainingBoards.length}]`

    // Create or get board mapping
    let bm
    if (migratedBoardIds.has(board.id)) {
      bm = await dbOne(
        'SELECT id FROM monday_board_mappings WHERE migration_session_id = $1 AND monday_board_id = $2',
        [SESSION_ID, board.id]
      )
    } else {
      bm = await dbOne(
        `INSERT INTO monday_board_mappings
         (migration_session_id, monday_board_id, monday_board_name, monday_board_type, department_id, status)
         VALUES ($1, $2, $3, $4, $5, 'migrating') RETURNING id`,
        [SESSION_ID, board.id, board.name, board.type, DEPARTMENT_ID]
      )
    }

    try {
      // Fetch items with cursor pagination
      let allItems = []
      let cursor = null
      let firstPage = true

      while (true) {
        let query, parseResponse
        if (firstPage) {
          query = `query { boards(ids: ["${board.id}"]) { items_page(limit: 100) { cursor items { id name state created_at updated_at group { id title } column_values { id type value text } } } } }`
          parseResponse = (data) => data.boards?.[0]?.items_page || { cursor: null, items: [] }
          firstPage = false
        } else {
          query = `query { next_items_page(cursor: "${cursor}", limit: 100) { cursor items { id name state created_at updated_at group { id title } column_values { id type value text } } } }`
          parseResponse = (data) => data.next_items_page || { cursor: null, items: [] }
        }

        const data = await mondayQuery(query)
        const result = parseResponse(data)
        allItems = allItems.concat(result.items || [])
        cursor = result.cursor
        if (!cursor) break
      }

      console.log(`${boardNum} ${board.name}: ${allItems.length} items`)

      if (allItems.length === 0) {
        await dbExec(`UPDATE monday_board_mappings SET status = 'completed', items_total = 0, completed_at = NOW() WHERE id = $1`, [bm.id])
        continue
      }

      await dbExec(`UPDATE monday_board_mappings SET items_total = $1, status = 'migrating' WHERE id = $2`, [allItems.length, bm.id])

      let boardMigrated = 0
      let boardFailed = 0

      // Process items in batches of 50 with a small delay between batches
      for (let j = 0; j < allItems.length; j++) {
        const item = allItems[j]

        // Check if already migrated (for the stuck board)
        const existing = await dbOne(
          'SELECT id FROM monday_item_mappings WHERE migration_session_id = $1 AND monday_item_id = $2',
          [SESSION_ID, item.id]
        )
        if (existing) {
          boardMigrated++
          continue
        }

        try {
          const title = (item.name || 'Untitled').substring(0, 255)
          const description = item.column_values?.find(cv => cv.type === 'long_text')?.text || null

          let dueDate = null, startDate = null
          const dateCol = item.column_values?.find(cv => cv.type === 'date')
          if (dateCol?.value) try { dueDate = JSON.parse(dateCol.value)?.date } catch {}
          const timelineCol = item.column_values?.find(cv => cv.type === 'timeline')
          if (timelineCol?.value) try { const v = JSON.parse(timelineCol.value); startDate = v?.from; dueDate = v?.to } catch {}

          let priority = 'medium'
          const statusCol = item.column_values?.find(cv => cv.type === 'status')
          if (statusCol?.value) {
            try {
              const label = JSON.parse(statusCol.value)?.label?.text?.toLowerCase() || ''
              if (label.includes('urgent') || label.includes('critical')) priority = 'urgent'
              else if (label.includes('high')) priority = 'high'
              else if (label.includes('low')) priority = 'low'
            } catch {}
          }

          let estimatedHours = null
          const numCol = item.column_values?.find(cv => cv.type === 'numbers')
          if (numCol?.text) { const h = parseFloat(numCol.text); if (!isNaN(h) && h > 0 && h < 1000) estimatedHours = h }

          const task = await dbOne(
            `INSERT INTO tasks
             (department_id, status_id, title, description, priority, due_date, start_date, estimated_hours, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [DEPARTMENT_ID, statusId, title, description, priority, dueDate, startDate, estimatedHours,
             item.created_at || new Date().toISOString(), item.updated_at || new Date().toISOString()]
          )

          await dbExec(
            `INSERT INTO monday_item_mappings
             (migration_session_id, board_mapping_id, monday_item_id, monday_item_name, task_id, source_data, column_values, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
             ON CONFLICT (migration_session_id, monday_item_id)
             DO UPDATE SET task_id = $5, status = 'completed', error_message = NULL`,
            [SESSION_ID, bm.id, item.id, (item.name || '').substring(0, 500), task.id,
             JSON.stringify(item), JSON.stringify(extractColumnValues(item))]
          )

          boardMigrated++
        } catch (err) {
          boardFailed++
          const errMsg = (err.message || String(err)).substring(0, 2000)
          try {
            await dbExec(
              `INSERT INTO monday_item_mappings
               (migration_session_id, board_mapping_id, monday_item_id, monday_item_name, source_data, status, error_message)
               VALUES ($1, $2, $3, $4, $5, 'failed', $6)
               ON CONFLICT (migration_session_id, monday_item_id)
               DO UPDATE SET status = 'failed', error_message = $6`,
              [SESSION_ID, bm.id, item.id, (item.name || '').substring(0, 500), JSON.stringify(item), errMsg]
            )
          } catch (logErr) {
            console.error(`  CRITICAL: Could not log error for item ${item.id}: ${logErr.message}`)
          }
          if (boardFailed <= 3) {
            console.error(`  Item ${item.id} (${item.name?.substring(0, 40)}) failed: ${errMsg.substring(0, 100)}`)
          }
        }

        // Small delay every 50 items to let Neon breathe
        if ((j + 1) % 50 === 0) {
          await sleep(500)
        }
      }

      await dbExec(
        `UPDATE monday_board_mappings SET status = 'completed', items_migrated = $1, items_failed = $2, completed_at = NOW() WHERE id = $3`,
        [boardMigrated, boardFailed, bm.id]
      )

      totalMigrated += boardMigrated
      totalFailed += boardFailed

      if (boardFailed > 0) {
        console.log(`  -> ${boardMigrated} migrated, ${boardFailed} failed`)
      }

      await sleep(300)

    } catch (err) {
      console.error(`${boardNum} ${board.name}: BOARD FAILED - ${err.message}`)
      await dbExec(`UPDATE monday_board_mappings SET status = 'failed', error_message = $1 WHERE id = $2`, [err.message, bm.id])
    }
  }

  // Mark session complete
  await dbExec(
    `UPDATE monday_migration_sessions SET status = 'completed', boards_migrated = (SELECT count(*) FROM monday_board_mappings WHERE migration_session_id = $1 AND status = 'completed'), items_migrated = (SELECT count(*) FROM monday_item_mappings WHERE migration_session_id = $1 AND status = 'completed'), completed_at = NOW() WHERE id = $1`,
    [SESSION_ID]
  )

  console.log(`\n=== RESUME COMPLETE ===`)
  console.log(`Items migrated: ${totalMigrated}`)
  console.log(`Items failed: ${totalFailed}`)

  await pool.end()
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
