/**
 * Import all Monday.com data into local database
 * POST /api/agency/monday/import-all
 *
 * Auto-creates departments from boards, then migrates all items as tasks.
 */

import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { createMondayClient } from '~~/server/utils/mondayClient'
import { queryOne, query, queryRows } from '~~/server/utils/db'
import { MondayMigrationService, createMigrationSession } from '~~/server/utils/mondayMigration'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

const BOARD_COLORS = ['#3B82F6', '#EC4899', '#F97316', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#6366F1', '#14B8A6', '#84CC16']

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { skipArchived = true, importUpdates = false, importFiles = false, importSubitems = true } = body || {}

  // Get stored token
  const config = await queryOne(`
    SELECT access_token, account_id, account_name FROM integration_configs
    WHERE integration_type = 'monday'
    LIMIT 1
  `)

  if (!config?.access_token) {
    throw createError({ statusCode: 401, statusMessage: 'Not connected to Monday.com' })
  }

  const client = await createMondayClient(config.access_token)

  // Fetch all boards from Monday
  const boards = await client.getBoards({
    state: skipArchived ? 'active' : 'all',
    limit: 500,
  })

  if (boards.length === 0) {
    return { success: true, message: 'No boards found', departments: 0, items: 0 }
  }

  // Get existing departments
  const existingDepts = await queryRows(`SELECT id, name, slug FROM departments`)

  // Get existing board→department mappings from previous migrations
  const existingMappings = await queryRows(`
    SELECT DISTINCT ON (monday_board_id) monday_board_id, department_id
    FROM monday_board_mappings
    WHERE department_id IS NOT NULL AND status IN ('completed', 'migrating', 'pending')
    ORDER BY monday_board_id, completed_at DESC NULLS LAST
  `)
  const mappingLookup = new Map(existingMappings.map(m => [m.monday_board_id, m.department_id]))

  // Build board→department mappings, creating departments as needed
  const boardMappings: Array<{ mondayBoardId: string; departmentId: string }> = []
  let departmentsCreated = 0

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i]

    // Check existing migration mapping first
    let departmentId = mappingLookup.get(board.id)

    if (!departmentId) {
      // Check if a department with the same name exists
      const slug = slugify(board.name)
      const existing = existingDepts.find(
        d => d.slug === slug || d.name.toLowerCase() === board.name.toLowerCase()
      )

      if (existing) {
        departmentId = existing.id
      } else {
        // Create new department from board
        const color = BOARD_COLORS[i % BOARD_COLORS.length]
        const dept = await queryOne(`
          INSERT INTO departments (name, slug, description, color, icon, is_active, sort_order)
          VALUES ($1, $2, $3, $4, $5, true, $6)
          ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `, [
          board.name,
          slug,
          `Imported from Monday.com board`,
          color,
          'briefcase',
          i,
        ])
        departmentId = dept!.id
        departmentsCreated++

        // Also create default statuses for this department
        const defaultStatuses = [
          { name: 'To Do', color: '#C4C4C4', isDefault: true, sortOrder: 0 },
          { name: 'Working on it', color: '#FDAB3D', isDefault: false, sortOrder: 1 },
          { name: 'Stuck', color: '#E2445C', isDefault: false, sortOrder: 2 },
          { name: 'Done', color: '#00C875', isDefault: false, sortOrder: 3, isFinal: true },
        ]
        for (const status of defaultStatuses) {
          await query(`
            INSERT INTO task_statuses (department_id, name, color, is_default, is_final, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
          `, [departmentId, status.name, status.color, status.isDefault, status.isFinal || false, status.sortOrder])
        }
      }
    }

    boardMappings.push({ mondayBoardId: board.id, departmentId })
  }

  // Create migration session
  const sessionId = await createMigrationSession(
    user.id,
    config.account_id || '',
    config.account_name || '',
    {
      skipArchivedBoards: skipArchived,
      skipCompletedItems: false,
      importUpdates,
      importFiles,
      importSubitems,
      boardMappings: boardMappings.map(bm => ({
        mondayBoardId: bm.mondayBoardId,
        departmentId: bm.departmentId,
      })),
    }
  )

  // Run migration
  const migrationService = new MondayMigrationService(client, sessionId, {
    skipArchivedBoards: skipArchived,
    skipCompletedItems: false,
    importUpdates,
    importFiles,
    importSubitems,
    boardMappings: boardMappings.map(bm => ({
      mondayBoardId: bm.mondayBoardId,
      departmentId: bm.departmentId,
    })),
  })

  await migrationService.migrate()

  // Get final stats
  const session = await queryOne(`SELECT * FROM monday_migration_sessions WHERE id = $1`, [sessionId])

  // Create sync log
  await query(`
    INSERT INTO sync_logs (integration_type, operation, status, started_by, started_at, completed_at, details)
    VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)
  `, [
    'monday',
    'full_import',
    session?.status === 'completed' ? 'success' : 'partial',
    user.id,
    JSON.stringify({
      sessionId,
      boardsSynced: session?.boards_migrated || 0,
      itemsSynced: session?.items_migrated || 0,
      itemsFailed: session?.items_failed || 0,
      departmentsCreated,
    }),
  ])

  return {
    success: session?.status === 'completed',
    sessionId,
    boardsTotal: session?.boards_total || 0,
    boardsMigrated: session?.boards_migrated || 0,
    itemsMigrated: session?.items_migrated || 0,
    itemsFailed: session?.items_failed || 0,
    departmentsCreated,
  }
})
