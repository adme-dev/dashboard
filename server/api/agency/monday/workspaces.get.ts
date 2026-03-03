/**
 * Get Monday.com Workspaces with Boards
 * GET /api/agency/monday/workspaces
 */

import { createError } from 'h3'
import { createMondayClient } from '../../../utils/mondayClient'
import { requireAuth } from '../../../utils/auth'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    if (!process.env.MONDAY_API_TOKEN) {
      return {
        workspaces: [],
        totalWorkspaces: 0,
        totalBoards: 0,
        totalItems: 0
      }
    }
    const client = createMondayClient(process.env.MONDAY_API_TOKEN)
    
    // Get workspaces
    const workspaces = await client.getWorkspaces()
    
    // Get all boards with workspace info
    const boards = await client.getBoards({ limit: 500, state: 'active' })
    
    // Group boards by workspace
    const workspaceData = workspaces.map(ws => {
      const wsBoards = boards.filter(b => b.workspace_id === ws.id && b.type === 'board')
      
      return {
        id: ws.id,
        name: ws.name,
        description: ws.description,
        kind: ws.kind,
        boards: wsBoards.map(b => ({
          id: b.id,
          name: b.name,
          type: b.type,
          itemsCount: b.items_count,
          columns: b.columns?.length || 0
        })),
        totalItems: wsBoards.reduce((sum, b) => sum + (b.items_count || 0), 0)
      }
    }).filter(ws => ws.boards.length > 0) // Only show workspaces with boards
     .sort((a, b) => b.totalItems - a.totalItems) // Sort by most items

    return {
      workspaces: workspaceData,
      totalWorkspaces: workspaceData.length,
      totalBoards: boards.filter(b => b.type === 'board').length,
      totalItems: workspaceData.reduce((sum, ws) => sum + ws.totalItems, 0)
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch workspaces: ${error.message}`
    })
  }
})
