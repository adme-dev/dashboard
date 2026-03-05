/**
 * GET /api/agency/boards/:id/connect
 * WebSocket upgrade proxy — routes to BoardRoom Durable Object.
 * In dev mode, returns a JSON mock (DO only works in Cloudflare Workers).
 */

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  const user = await requireAuth(event)

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

  const wsHeaders: Record<string, string> = { Upgrade: 'websocket' }
  const rawHeaders = event.node.req.headers || {}
  for (const key of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol']) {
    const val = rawHeaders[key]
    if (typeof val === 'string') wsHeaders[key] = val
  }

  const upgradeRequest = new Request(url.toString(), { headers: wsHeaders })

  return stub.fetch(upgradeRequest)
})
