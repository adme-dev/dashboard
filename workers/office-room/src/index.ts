/**
 * Office Rooms Worker — entry point
 *
 * Routes WebSocket upgrade requests to the appropriate OfficeRoom Durable
 * Object. The browser opens WS directly to this worker (cross-origin from
 * Pages) carrying a short-lived HS256 JWT in the `t` query param. The worker
 * verifies the JWT (shared OFFICE_SYNC_SECRET), then forwards the upgrade
 * to the DO with the verified identity in the inner URL params.
 */

import { OfficeRoom } from './OfficeRoom'
import { verifyOfficeJwt } from './jwt'

interface Env {
  OFFICE_ROOMS: DurableObjectNamespace<OfficeRoom>
  OFFICE_SYNC_SECRET?: string
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

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    // JWT validation
    const token = url.searchParams.get('t')
    if (!token) {
      return new Response('Missing token', { status: 401 })
    }
    if (!env.OFFICE_SYNC_SECRET) {
      return new Response('Server not configured (OFFICE_SYNC_SECRET)', { status: 500 })
    }
    const claims = await verifyOfficeJwt(token, env.OFFICE_SYNC_SECRET)
    if (!claims) {
      return new Response('Invalid or expired token', { status: 401 })
    }
    if (claims.officeId !== officeId) {
      return new Response('Token does not match office', { status: 403 })
    }

    // Forward to the DO with the verified identity. The DO's existing
    // fetch() reads handle/name/avatarUrl/role/isGuest from query params.
    const id = env.OFFICE_ROOMS.idFromName(officeId)
    const stub = env.OFFICE_ROOMS.get(id)
    const params = new URLSearchParams({
      // officeId is forwarded explicitly because idFromName is one-way — the
      // DO's ctx.id is a hash of the name, not the name itself. Without this
      // the DO has no way to query office_zones for capacity/cf_meeting_id.
      officeId,
      handle: claims.handle,
      name: claims.name,
      avatarUrl: claims.avatarUrl ?? '',
      role: claims.role,
      isGuest: claims.isGuest ? 'true' : 'false'
    })
    return stub.fetch(`https://office-room-do/?${params.toString()}`, {
      headers: request.headers
    })
  }
} satisfies ExportedHandler<Env>
