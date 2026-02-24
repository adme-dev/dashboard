/**
 * Standalone Monday.com migration script
 * Connects directly to Monday API + Neon DB, bypassing Nuxt server
 *
 * Run: node scripts/run-migration.mjs
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

const pool = new Pool({ connectionString: DB_URL })

// Monday.com API helper with retry
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// DB helpers
async function dbQuery(sql, params) {
  const result = await pool.query(sql, params)
  return result.rows
}
async function dbOne(sql, params) {
  const rows = await dbQuery(sql, params)
  return rows[0] || null
}
async function dbExec(sql, params) {
  const result = await pool.query(sql, params)
  return result.rowCount || 0
}

async function main() {
  console.log('=== Monday.com Migration ===')
  console.log(`Department: ${DEPARTMENT_ID}`)

  // 1. Test Monday.com connection
  const me = await mondayQuery('query { me { id name account { id name slug } } }')
  console.log(`Connected to: ${me.me.account.name}`)

  // 2. Ensure task statuses exist
  let statusId = (await dbOne('SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1', [DEPARTMENT_ID]))?.id
  if (!statusId) {
    console.log('Creating default statuses...')
    const defaults = [
      { name: 'To Do', slug: 'to-do', color: '#797e93', sort_order: 0, is_default: true, category: 'not_started' },
      { name: 'In Progress', slug: 'in-progress', color: '#fdab3d', sort_order: 1, is_default: false, category: 'in_progress' },
      { name: 'Done', slug: 'done', color: '#00c875', sort_order: 2, is_default: false, category: 'done' },
    ]
    for (const s of defaults) {
      await dbExec(
        `INSERT INTO task_statuses (department_id, name, slug, color, sort_order, is_default, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [DEPARTMENT_ID, s.name, s.slug, s.color, s.sort_order, s.is_default, s.category]
      )
    }
    statusId = (await dbOne('SELECT id FROM task_statuses WHERE department_id = $1 ORDER BY sort_order LIMIT 1', [DEPARTMENT_ID]))?.id
  }
  console.log(`Default status: ${statusId}`)

  // 3. Create migration session
  const session = await dbOne(
    `INSERT INTO monday_migration_sessions (started_by, monday_account_id, monday_account_name, config)
     VALUES ((SELECT id FROM team_members LIMIT 1), $1, $2, $3) RETURNING id`,
    [me.me.account.id, me.me.account.name, JSON.stringify({ importUpdates: false, importFiles: false, importSubitems: true })]
  )
  const sessionId = session.id
  console.log(`Session: ${sessionId}`)

  // 4. Fetch all boards
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
  console.log(`Found ${allBoards.length} active boards`)

  await dbExec('UPDATE monday_migration_sessions SET boards_total = $1, updated_at = NOW() WHERE id = $2', [allBoards.length, sessionId])

  // 5. Process each board
  let totalMigrated = 0
  let totalFailed = 0
  let totalSkipped = 0

  for (let i = 0; i < allBoards.length; i++) {
    const board = allBoards[i]
    const boardNum = `[${i + 1}/${allBoards.length}]`

    // Create board mapping
    const bm = await dbOne(
      `INSERT INTO monday_board_mappings
       (migration_session_id, monday_board_id, monday_board_name, monday_board_type, department_id, status)
       VALUES ($1, $2, $3, $4, $5, 'migrating') RETURNING id`,
      [sessionId, board.id, board.name, board.type, DEPARTMENT_ID]
    )

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
        await dbExec(`UPDATE monday_migration_sessions SET boards_migrated = boards_migrated + 1 WHERE id = $1`, [sessionId])
        totalSkipped++
        continue
      }

      await dbExec(`UPDATE monday_board_mappings SET items_total = $1 WHERE id = $2`, [allItems.length, bm.id])

      let boardMigrated = 0
      let boardFailed = 0

      for (const item of allItems) {
        try {
          // Extract data from Monday.com item
          const title = (item.name || 'Untitled').substring(0, 255)
          const description = item.column_values?.find(cv => cv.type === 'long_text')?.text || null

          // Extract dates
          let dueDate = null, startDate = null
          const dateCol = item.column_values?.find(cv => cv.type === 'date')
          if (dateCol?.value) try { dueDate = JSON.parse(dateCol.value)?.date } catch {}
          const timelineCol = item.column_values?.find(cv => cv.type === 'timeline')
          if (timelineCol?.value) try { const v = JSON.parse(timelineCol.value); startDate = v?.from; dueDate = v?.to } catch {}

          // Extract priority
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

          // Extract estimated hours
          let estimatedHours = null
          const numCol = item.column_values?.find(cv => cv.type === 'numbers')
          if (numCol?.text) { const h = parseFloat(numCol.text); if (!isNaN(h) && h > 0 && h < 1000) estimatedHours = h }

          // INSERT task
          const task = await dbOne(
            `INSERT INTO tasks
             (department_id, status_id, title, description, priority, due_date, start_date, estimated_hours, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [DEPARTMENT_ID, statusId, title, description, priority, dueDate, startDate, estimatedHours,
             item.created_at || new Date().toISOString(), item.updated_at || new Date().toISOString()]
          )

          // INSERT item mapping
          await dbExec(
            `INSERT INTO monday_item_mappings
             (migration_session_id, board_mapping_id, monday_item_id, monday_item_name, task_id, source_data, column_values, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
             ON CONFLICT (migration_session_id, monday_item_id)
             DO UPDATE SET task_id = $5, status = 'completed', error_message = NULL`,
            [sessionId, bm.id, item.id, (item.name || '').substring(0, 500), task.id,
             JSON.stringify(item), JSON.stringify(extractColumnValues(item))]
          )

          boardMigrated++
        } catch (err) {
          boardFailed++
          const errMsg = (err.message || String(err)).substring(0, 2000)
          // Log the error into the DB
          try {
            await dbExec(
              `INSERT INTO monday_item_mappings
               (migration_session_id, board_mapping_id, monday_item_id, monday_item_name, source_data, status, error_message)
               VALUES ($1, $2, $3, $4, $5, 'failed', $6)
               ON CONFLICT (migration_session_id, monday_item_id)
               DO UPDATE SET status = 'failed', error_message = $6`,
              [sessionId, bm.id, item.id, (item.name || '').substring(0, 500), JSON.stringify(item), errMsg]
            )
          } catch (logErr) {
            console.error(`  CRITICAL: Could not log error for item ${item.id}: ${logErr.message}`)
          }
          if (boardFailed <= 3) {
            console.error(`  Item ${item.id} (${item.name?.substring(0,40)}) failed: ${errMsg.substring(0,100)}`)
          }
        }
      }

      // Update board mapping
      await dbExec(
        `UPDATE monday_board_mappings SET status = 'completed', items_migrated = $1, items_failed = $2, completed_at = NOW() WHERE id = $3`,
        [boardMigrated, boardFailed, bm.id]
      )
      await dbExec(
        `UPDATE monday_migration_sessions SET boards_migrated = boards_migrated + 1, items_migrated = items_migrated + $1, items_failed = items_failed + $2 WHERE id = $3`,
        [boardMigrated, boardFailed, sessionId]
      )

      totalMigrated += boardMigrated
      totalFailed += boardFailed

      if (boardFailed > 0) {
        console.log(`  -> ${boardMigrated} migrated, ${boardFailed} failed`)
      }

      // Small delay between boards to respect rate limits
      await sleep(200)

    } catch (err) {
      console.error(`${boardNum} ${board.name}: BOARD FAILED - ${err.message}`)
      await dbExec(`UPDATE monday_board_mappings SET status = 'failed', error_message = $1 WHERE id = $2`, [err.message, bm.id])
      await dbExec(`UPDATE monday_migration_sessions SET boards_migrated = boards_migrated + 1 WHERE id = $1`, [sessionId])
    }
  }

  // 6. Mark session complete
  await dbExec(
    `UPDATE monday_migration_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [sessionId]
  )

  console.log(`\n=== COMPLETE ===`)
  console.log(`Boards: ${allBoards.length} (${totalSkipped} empty)`)
  console.log(`Items migrated: ${totalMigrated}`)
  console.log(`Items failed: ${totalFailed}`)
  console.log(`Session: ${sessionId}`)

  await pool.end()
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

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
