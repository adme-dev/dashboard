/**
 * Get all boards from Monday.com
 * GET /api/agency/monday/boards
 */

import { createError, getQuery } from 'h3'
import { createMondayClient } from '../../../utils/mondayClient'
import { requireAuth } from '../../../utils/auth'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const state = query.state as string | undefined

  try {
    const client = await createMondayClient()
    const boards = await client.getBoards({
      state: state as any,
      limit: 500,
    })

    return {
      boards: boards.map(board => ({
        id: board.id,
        name: board.name,
        type: board.type,
        state: board.state,
        workspaceId: board.workspace_id,
        owner: board.owner,
        itemCount: board.items_count,
        columns: board.columns?.map(col => ({
          id: col.id,
          title: col.title,
          type: col.type,
        })),
      })),
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch boards: ${error.message}`,
    })
  }
})
