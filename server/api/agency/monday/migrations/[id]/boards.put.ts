/**
 * Update board mappings for a migration
 * PUT /api/agency/monday/migrations/:id/boards
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

interface BoardMappingUpdate {
  boardMappingId: string
  departmentId?: string
  projectId?: string
  statusMapping?: Record<string, string>
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Session ID is required' })
  }

  const body = await readBody(event)
  const { boards } = body as { boards: BoardMappingUpdate[] }

  if (!boards || !Array.isArray(boards)) {
    throw createError({ statusCode: 400, statusMessage: 'Boards array is required' })
  }

  try {
    for (const board of boards) {
      await execute(
        `UPDATE monday_board_mappings 
         SET department_id = COALESCE($1, department_id),
             project_id = COALESCE($2, project_id),
             status_mapping = COALESCE($3, status_mapping),
             updated_at = NOW()
         WHERE id = $4 AND migration_session_id = $5`,
        [
          board.departmentId,
          board.projectId,
          board.statusMapping ? JSON.stringify(board.statusMapping) : null,
          board.boardMappingId,
          sessionId,
        ]
      )
    }

    return {
      success: true,
      message: `${boards.length} board mappings updated`,
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update board mappings: ${error.message}`,
    })
  }
})
