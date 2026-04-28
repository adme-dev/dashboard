/**
 * GET /api/agency/boards/:id/connect
 * WebSocket upgrade proxy — routes to BoardRoom Durable Object.
 * In dev mode, returns a JSON mock (DO only works in Cloudflare Workers).
 *
 * Accepts either a department UUID or a slug. The DO room MUST be keyed by the
 * UUID because server/utils/boardEvents.ts emits with the UUID — keying the
 * room by slug here would silently route events to a different DO instance.
 */

import { toWebRequest } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { isUUID } from '~~/server/utils/ids'

export default defineEventHandler(async (event) => {
  const boardIdOrSlug = getRouterParam(event, 'id')
  if (!boardIdOrSlug) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  const user = await requireAuth(event)

  const board = isUUID(boardIdOrSlug)
    ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardIdOrSlug])
    : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardIdOrSlug])

  if (!board) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found' })
  }

  const boardId: string = board.id

  // In development, return mock
  if (process.dev) {
    return {
      message: 'Board WebSocket endpoint',
      boardId,
      userId: user.id,
      note: 'Durable Objects only work in Cloudflare Workers environment. Use SSE/polling fallback in dev.',
    }
  }

  // Production: proxy to BoardRoom Durable Object
  const env = (event.context.cloudflare as any)?.env
  if (!env?.BOARD_ROOMS) {
    throw createError({ statusCode: 503, statusMessage: 'Board events service unavailable' })
  }

  const id = env.BOARD_ROOMS.idFromName(boardId)
  const stub = env.BOARD_ROOMS.get(id)

  const url = new URL(`https://board-do/board/${boardId}`)
  url.searchParams.set('userId', user.id)
  url.searchParams.set('userName', user.name || 'Anonymous')
  if (user.avatar_url) {
    url.searchParams.set('userAvatar', user.avatar_url)
  }

  // Clone the original Worker Request with the rewritten URL.
  // `new Request(url, init)` strips forbidden upgrade headers (Connection,
  // Upgrade, Sec-WebSocket-*); cloning preserves them so the DO sees a real
  // WebSocket upgrade request and returns 101.
  const originalRequest = toWebRequest(event)
  const upgradeRequest = new Request(url.toString(), originalRequest)

  return stub.fetch(upgradeRequest)
})
