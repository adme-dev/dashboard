/**
 * Board Events Worker — entry point
 *
 * Routes requests to the appropriate BoardRoom Durable Object.
 * Each board gets its own DO instance keyed by boardId.
 */

import { BoardRoom } from './BoardRoom'

interface Env {
  BOARD_ROOMS: DurableObjectNamespace<BoardRoom>
}

export { BoardRoom }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Expected paths:
    // /board/:boardId (WebSocket upgrade)
    // /board/:boardId/emit (POST)
    // /board/:boardId/presence (GET)
    const match = url.pathname.match(/^\/board\/([^/]+)(\/(?:emit|presence))?$/)
    if (!match) {
      return new Response('Not found. Use /board/:boardId', { status: 404 })
    }

    const boardId = match[1]

    // Get or create a DO instance keyed by boardId
    const id = env.BOARD_ROOMS.idFromName(boardId)
    const stub = env.BOARD_ROOMS.get(id)

    // Forward the request to the Durable Object
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
