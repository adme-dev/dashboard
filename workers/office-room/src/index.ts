/**
 * Office Rooms Worker — entry point
 *
 * Routes WebSocket upgrade requests to the appropriate OfficeRoom Durable
 * Object. Each office gets its own DO instance keyed by officeId.
 *
 * In normal operation the Pages app talks to the DO directly via the
 * OFFICE_ROOMS binding (env.OFFICE_ROOMS.get(...).fetch()), so this default
 * fetch handler is rarely hit. It exists so the worker is a valid module
 * worker (Cloudflare requires a default export to host Durable Objects).
 */

import { OfficeRoom } from './OfficeRoom'

interface Env {
  OFFICE_ROOMS: DurableObjectNamespace<OfficeRoom>
}

export { OfficeRoom }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Expected path: /office/:officeId
    const match = url.pathname.match(/^\/office\/([^/]+)$/)
    if (!match) {
      return new Response('Not found. Use /office/:officeId', { status: 404 })
    }

    const officeId = match[1]!
    const id = env.OFFICE_ROOMS.idFromName(officeId)
    const stub = env.OFFICE_ROOMS.get(id)
    return stub.fetch(request)
  }
} satisfies ExportedHandler<Env>
