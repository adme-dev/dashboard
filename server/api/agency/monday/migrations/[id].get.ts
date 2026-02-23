/**
 * Get migration session details
 * GET /api/agency/monday/migrations/:id
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Session ID is required' })
  }

  const session = await queryOne(
    `SELECT ms.*, tm.name as started_by_name
     FROM monday_migration_sessions ms
     LEFT JOIN team_members tm ON ms.started_by = tm.id
     WHERE ms.id = $1`,
    [sessionId]
  )

  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Migration session not found' })
  }

  const boardMappings = await queryRows(
    `SELECT 
       bm.*,
       d.name as department_name,
       p.name as project_name
     FROM monday_board_mappings bm
     LEFT JOIN departments d ON bm.department_id = d.id
     LEFT JOIN projects p ON bm.project_id = p.id
     WHERE bm.migration_session_id = $1
     ORDER BY bm.monday_board_name`,
    [sessionId]
  )

  return {
    id: session.id,
    status: session.status,
    startedAt: session.started_at,
    completedAt: session.completed_at,
    startedBy: session.started_by_name,
    mondayAccount: {
      id: session.monday_account_id,
      name: session.monday_account_name,
    },
    config: session.config,
    stats: {
      boardsTotal: session.boards_total,
      boardsMigrated: session.boards_migrated,
      itemsTotal: session.items_total,
      itemsMigrated: session.items_migrated,
      itemsFailed: session.items_failed,
    },
    error: session.error_message ? {
      message: session.error_message,
      details: session.error_details,
    } : null,
    boards: boardMappings.map((bm: any) => ({
      id: bm.id,
      mondayBoardId: bm.monday_board_id,
      mondayBoardName: bm.monday_board_name,
      mondayBoardType: bm.monday_board_type,
      departmentId: bm.department_id,
      departmentName: bm.department_name,
      projectId: bm.project_id,
      projectName: bm.project_name,
      status: bm.status,
      stats: {
        itemsTotal: bm.items_total,
        itemsMigrated: bm.items_migrated,
        itemsFailed: bm.items_failed,
      },
      startedAt: bm.started_at,
      completedAt: bm.completed_at,
      error: bm.error_message,
    })),
  }
})
