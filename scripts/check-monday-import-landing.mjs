/**
 * Read-only Monday → local landing smoke test.
 *
 * Required: DATABASE_URL, MONDAY_API_TOKEN, and optionally MONDAY_SMOKE_BOARD_ID.
 * It compares a bounded Monday item sample with monday_item_mappings/tasks and
 * checks provenance, task ownership, comments, and file mapping invariants.
 */
import pg from 'pg'

const { Pool } = pg
const dbUrl = process.env.DATABASE_URL
const token = process.env.MONDAY_API_TOKEN
if (!dbUrl || !token) throw new Error('DATABASE_URL and MONDAY_API_TOKEN are required')

const boardId = process.env.MONDAY_SMOKE_BOARD_ID
const query = `query ($board: ID!) { boards(ids: [$board]) { id name state items_page(limit: 100) { items { id name state updated_at updates(limit: 100) { id } assets { id } } } } }`
const response = await fetch('https://api.monday.com/v2', { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { board: boardId || '18419440327' } }) })
if (!response.ok) throw new Error(`Monday API HTTP ${response.status}`)
const payload = await response.json()
if (payload.errors?.length) throw new Error(payload.errors.map(error => error.message).join('; '))
const board = payload.data.boards[0]
if (!board) throw new Error('Smoke board was not found')

const pool = new Pool({ connectionString: dbUrl })
try {
  const ids = board.items_page.items.map(item => item.id)
  const mapping = await pool.query(`
    SELECT DISTINCT ON (mim.monday_item_id)
           mim.monday_item_id, mim.task_id, mim.status, t.id AS task_exists,
           (SELECT COUNT(*) FROM monday_update_mappings mum WHERE mum.item_mapping_id = mim.id) AS update_mappings,
           (SELECT COUNT(*) FROM monday_file_mappings mfm WHERE mfm.item_mapping_id = mim.id) AS file_mappings
      FROM monday_item_mappings mim
      LEFT JOIN tasks t ON t.id = mim.task_id
     WHERE mim.monday_item_id = ANY($1::text[])
     ORDER BY mim.monday_item_id, mim.updated_at DESC`, [ids])
  const divergent = await pool.query(`
    SELECT monday_item_id, COUNT(DISTINCT task_id)::int AS task_count
      FROM monday_item_mappings
     WHERE monday_item_id = ANY($1::text[]) AND task_id IS NOT NULL
     GROUP BY monday_item_id
    HAVING COUNT(DISTINCT task_id) > 1`, [ids])
  const byId = new Map(mapping.rows.map(row => [row.monday_item_id, row]))
  const missing = ids.filter(id => !byId.has(id))
  const broken = mapping.rows.filter(row => row.status === 'completed' && !row.task_exists)
  const result = {
    board: { id: board.id, name: board.name, state: board.state },
    mondaySample: ids.length,
    mapped: mapping.rows.length,
    missing: missing.length,
    missingItemIds: missing.slice(0, 20),
    brokenCompletedMappings: broken.length,
    divergentTaskMappings: divergent.rows.length,
    commentsAndFiles: {
      sourceComments: board.items_page.items.reduce((total, item) => total + item.updates.length, 0),
      mappedComments: mapping.rows.reduce((total, row) => total + Number(row.update_mappings), 0),
      sourceFiles: board.items_page.items.reduce((total, item) => total + item.assets.length, 0),
      mappedFiles: mapping.rows.reduce((total, row) => total + Number(row.file_mappings), 0),
    },
  }
  result.commentsAndFiles.missingComments = Math.max(0, result.commentsAndFiles.sourceComments - result.commentsAndFiles.mappedComments)
  result.commentsAndFiles.missingFiles = Math.max(0, result.commentsAndFiles.sourceFiles - result.commentsAndFiles.mappedFiles)
  console.log(JSON.stringify(result, null, 2))
  if (broken.length || result.divergentTaskMappings || result.commentsAndFiles.missingComments || result.commentsAndFiles.missingFiles) process.exitCode = 2
} finally { await pool.end() }
