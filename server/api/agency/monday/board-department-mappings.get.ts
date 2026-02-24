/**
 * Get existing Monday board → department mappings from migration data
 * GET /api/agency/monday/board-department-mappings
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    // Get the most recent completed mapping for each Monday board
    const mappings = await queryRows(`
      SELECT DISTINCT ON (bm.monday_board_id)
        bm.monday_board_id,
        bm.monday_board_name,
        bm.department_id,
        d.name AS department_name
      FROM monday_board_mappings bm
      JOIN departments d ON bm.department_id = d.id
      WHERE bm.department_id IS NOT NULL
        AND bm.status IN ('completed', 'migrating', 'pending')
      ORDER BY bm.monday_board_id, bm.completed_at DESC NULLS LAST, bm.created_at DESC
    `)

    return {
      mappings: mappings.map(m => ({
        mondayBoardId: m.monday_board_id,
        mondayBoardName: m.monday_board_name,
        departmentId: m.department_id,
        departmentName: m.department_name,
      }))
    }
  } catch (error: any) {
    console.error('Failed to fetch board-department mappings:', error)
    return { mappings: [] }
  }
})
