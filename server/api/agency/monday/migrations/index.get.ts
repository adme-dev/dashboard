/**
 * Get all migration sessions
 * GET /api/agency/monday/migrations
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const sessions = await queryRows(
    `SELECT 
       ms.*,
       tm.name as started_by_name,
       COUNT(bm.id) as total_boards,
       COUNT(bm.id) FILTER (WHERE bm.status = 'completed') as completed_boards
     FROM monday_migration_sessions ms
     LEFT JOIN team_members tm ON ms.started_by = tm.id
     LEFT JOIN monday_board_mappings bm ON ms.id = bm.migration_session_id
     GROUP BY ms.id, tm.name
     ORDER BY ms.started_at DESC`
  )

  return {
    sessions: sessions.map((session: any) => ({
      id: session.id,
      status: session.status,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      startedBy: session.started_by_name,
      mondayAccount: {
        id: session.monday_account_id,
        name: session.monday_account_name,
      },
      stats: {
        boardsTotal: session.boards_total,
        boardsMigrated: session.boards_migrated,
        itemsTotal: session.items_total,
        itemsMigrated: session.items_migrated,
        itemsFailed: session.items_failed,
      },
      boardProgress: {
        total: session.total_boards || 0,
        completed: session.completed_boards || 0,
      },
      error: session.error_message,
    })),
  }
})
