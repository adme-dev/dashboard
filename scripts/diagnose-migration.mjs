/**
 * Diagnostic script to test migration INSERT operations
 * Run: node scripts/diagnose-migration.mjs
 */

import { Pool } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

const pool = new Pool({
  connectionString: DATABASE_URL,
})

async function diagnose() {
  try {
    // 1. Check if tables exist
    console.log('=== TABLE CHECK ===')
    const tables = ['tasks', 'task_statuses', 'monday_item_mappings', 'monday_board_mappings', 'task_activities']
    for (const table of tables) {
      const res = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`, [table])
      console.log(`  ${table}: ${res.rows[0].exists ? 'EXISTS' : 'MISSING'}`)
    }

    // 2. Check tasks table columns
    console.log('\n=== TASKS TABLE COLUMNS ===')
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'tasks'
      ORDER BY ordinal_position
    `)
    for (const col of cols.rows) {
      console.log(`  ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`)
    }

    // 3. Check monday_item_mappings table columns
    console.log('\n=== MONDAY_ITEM_MAPPINGS TABLE COLUMNS ===')
    const mCols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'monday_item_mappings'
      ORDER BY ordinal_position
    `)
    if (mCols.rows.length === 0) {
      console.log('  TABLE DOES NOT EXIST!')
    } else {
      for (const col of mCols.rows) {
        console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`)
      }
    }

    // 4. Get department and status IDs for test
    const dept = await pool.query(`SELECT id, name FROM departments WHERE id = '8da06179-933c-4c09-a3c2-a697bc205a8c'`)
    console.log(`\n=== DEPARTMENT: ${dept.rows[0]?.name || 'NOT FOUND'} ===`)

    const statuses = await pool.query(`SELECT id, name, slug, is_default FROM task_statuses WHERE department_id = '8da06179-933c-4c09-a3c2-a697bc205a8c' ORDER BY sort_order`)
    console.log('\n=== TASK STATUSES ===')
    for (const s of statuses.rows) {
      console.log(`  ${s.name} (${s.slug}) default=${s.is_default} id=${s.id}`)
    }

    const statusId = statuses.rows.find(s => s.is_default)?.id || statuses.rows[0]?.id
    if (!statusId) {
      console.log('ERROR: No status found for department!')
      return
    }

    // 5. Try the exact INSERT that migration does
    console.log('\n=== TEST INSERT INTO tasks ===')
    try {
      const result = await pool.query(
        `INSERT INTO tasks
         (project_id, department_id, status_id, title, description, priority, assignee_id, due_date, start_date, estimated_hours, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          null, // project_id
          '8da06179-933c-4c09-a3c2-a697bc205a8c', // department_id
          statusId,
          'TEST Migration Item',
          null, // description
          'medium',
          null, // assignee_id
          null, // due_date
          null, // start_date
          null, // estimated_hours
          new Date().toISOString(), // created_at
          new Date().toISOString(), // updated_at
        ]
      )
      console.log(`  SUCCESS: task id = ${result.rows[0].id}`)

      // Clean up
      await pool.query('DELETE FROM tasks WHERE id = $1', [result.rows[0].id])
      console.log('  Cleaned up test task')
    } catch (err) {
      console.log(`  FAILED: ${err.message}`)
      console.log(`  Detail: ${err.detail}`)
      console.log(`  Code: ${err.code}`)
    }

    // 6. Check current migration session
    console.log('\n=== CURRENT MIGRATION SESSION ===')
    const session = await pool.query(`
      SELECT id, status, boards_total, boards_migrated, items_migrated, items_failed, error_message, error_details
      FROM monday_migration_sessions
      WHERE status = 'running'
      ORDER BY started_at DESC LIMIT 1
    `)
    if (session.rows[0]) {
      const s = session.rows[0]
      console.log(`  Session: ${s.id}`)
      console.log(`  Status: ${s.status}`)
      console.log(`  Boards: ${s.boards_migrated}/${s.boards_total}`)
      console.log(`  Items migrated: ${s.items_migrated}, failed: ${s.items_failed}`)
      if (s.error_details) {
        const details = typeof s.error_details === 'string' ? JSON.parse(s.error_details) : s.error_details
        console.log(`  Errors (first 5): ${JSON.stringify(details.errors?.slice(0, 5), null, 2)}`)
      }
    }

    // 7. Check if any item mappings exist for any session
    console.log('\n=== ALL ITEM MAPPINGS ===')
    const mappings = await pool.query(`
      SELECT count(*) as total,
             count(*) FILTER (WHERE status = 'completed') as completed,
             count(*) FILTER (WHERE status = 'failed') as failed
      FROM monday_item_mappings
    `)
    console.log(`  Total: ${mappings.rows[0].total}, Completed: ${mappings.rows[0].completed}, Failed: ${mappings.rows[0].failed}`)

    // 8. Check if monday_item_mappings INSERT works
    console.log('\n=== TEST INSERT INTO monday_item_mappings ===')
    const bm = await pool.query(`SELECT id, migration_session_id FROM monday_board_mappings ORDER BY created_at DESC LIMIT 1`)
    if (bm.rows[0]) {
      try {
        const result = await pool.query(
          `INSERT INTO monday_item_mappings
           (migration_session_id, board_mapping_id, monday_item_id, monday_item_name, source_data, status, error_message)
           VALUES ($1, $2, $3, $4, $5, 'failed', $6)
           ON CONFLICT (migration_session_id, monday_item_id) DO UPDATE SET status = 'failed', error_message = $6
           RETURNING id`,
          [bm.rows[0].migration_session_id, bm.rows[0].id, 'test_diag_99999', 'Test Item', '{}', 'test error message']
        )
        console.log(`  SUCCESS: mapping id = ${result.rows[0].id}`)
        // Clean up
        await pool.query('DELETE FROM monday_item_mappings WHERE id = $1', [result.rows[0].id])
        console.log('  Cleaned up test mapping')
      } catch (err) {
        console.log(`  FAILED: ${err.message}`)
        console.log(`  Detail: ${err.detail}`)
        console.log(`  Code: ${err.code}`)
      }
    }

    // 9. Count tasks in this department
    console.log('\n=== TASKS IN DEPARTMENT ===')
    const taskCount = await pool.query(`SELECT count(*) as total FROM tasks WHERE department_id = '8da06179-933c-4c09-a3c2-a697bc205a8c'`)
    console.log(`  Total tasks: ${taskCount.rows[0].total}`)

  } finally {
    await pool.end()
  }
}

diagnose().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})
