/**
 * GET /api/chat/:channelId/connect
 * WebSocket upgrade proxy — routes to ChatRoom Durable Object.
 * In dev mode, returns a JSON mock (DO only works in Cloudflare Workers).
 */

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')
  const query = getQuery(event)

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  // Authenticate
  const user = await requireAuth(event)

  // In development, return mock (same pattern as /api/ws/tasks/[id].ts)
  if (process.dev) {
    return {
      message: 'Chat WebSocket endpoint',
      channelId,
      userId: user.id,
      note: 'Durable Objects only work in Cloudflare Workers environment. Use polling fallback in dev.'
    }
  }

  // Production: proxy to ChatRoom Durable Object
  const env = (event.context.cloudflare as any)?.env
  if (!env?.CHAT_ROOMS) {
    throw createError({ statusCode: 503, statusMessage: 'Chat service unavailable' })
  }

  const id = env.CHAT_ROOMS.idFromName(channelId)
  const stub = env.CHAT_ROOMS.get(id)

  // Build the URL for the DO
  const url = new URL(`https://chat-do/chat/${channelId}`)
  url.searchParams.set('userId', user.id)
  url.searchParams.set('userName', user.name || 'Anonymous')
  if (user.avatar_url) {
    url.searchParams.set('userAvatar', user.avatar_url)
  }

  // Forward the upgrade request to the Durable Object
  const upgradeRequest = new Request(url.toString(), {
    headers: {
      Upgrade: 'websocket',
      ...Object.fromEntries(
        Array.from(event.node.req.headers as any).filter(([k]: [string]) =>
          ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol']
            .includes(k.toLowerCase())
        )
      )
    }
  })

  return stub.fetch(upgradeRequest)
})
