/**
 * Banner Rooms Worker — entry point
 *
 * Routes requests to the appropriate BannerRoom Durable Object.
 * Each banner project gets its own DO instance keyed by projectId.
 */

import { BannerRoom } from './BannerRoom'

interface Env {
  BANNER_ROOMS: DurableObjectNamespace<BannerRoom>
}

export { BannerRoom }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Expected paths:
    // /banner/:projectId (WebSocket upgrade)
    // /banner/:projectId/presence (GET)
    const match = url.pathname.match(/^\/banner\/([^/]+)(\/presence)?$/)
    if (!match) {
      return new Response('Not found. Use /banner/:projectId', { status: 404 })
    }

    const projectId = match[1]
    const id = env.BANNER_ROOMS.idFromName(projectId)
    const stub = env.BANNER_ROOMS.get(id)

    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
