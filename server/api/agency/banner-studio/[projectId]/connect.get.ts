/**
 * GET /api/agency/banner-studio/:projectId/connect
 * WebSocket upgrade proxy — routes to BannerRoom Durable Object.
 * In dev mode, returns a JSON mock (DO only works in Cloudflare Workers).
 */

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID required' })
  }

  const user = await requireAuth(event)

  // In development, return mock
  if (process.dev) {
    return {
      message: 'Banner WebSocket endpoint',
      projectId,
      userId: user.id,
      note: 'Durable Objects only work in Cloudflare Workers environment.',
    }
  }

  // Production: proxy to BannerRoom Durable Object
  const env = (event.context.cloudflare as any)?.env
  if (!env?.BANNER_ROOMS) {
    throw createError({ statusCode: 503, statusMessage: 'Banner collaboration service unavailable' })
  }

  const id = env.BANNER_ROOMS.idFromName(projectId)
  const stub = env.BANNER_ROOMS.get(id)

  const url = new URL(`https://banner-do/banner/${projectId}`)
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
