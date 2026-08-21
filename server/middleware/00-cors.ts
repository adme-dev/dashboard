function normaliseOrigin(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

function allowedOrigins() {
  const origins = new Set<string>()
  for (const value of [
    process.env.APP_URL,
    process.env.NUXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  ]) {
    const origin = normaliseOrigin(value)
    if (origin) origins.add(origin)
  }
  return origins
}

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/api/')) return

  const origin = getHeader(event, 'origin')
  if (!origin || origin === 'null') return

  const origins = allowedOrigins()
  const isPublicTrackingEndpoint = pathname === '/api/public/track'
    || pathname === '/api/public/lead-intent'
  const isAllowed = isPublicTrackingEndpoint || origins.has(origin)

  if (!isAllowed) return

  setHeader(event, 'access-control-allow-origin', origin)
  setHeader(event, 'access-control-allow-credentials', 'true')
  setHeader(event, 'vary', 'Origin')
  setHeader(event, 'access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  setHeader(
    event,
    'access-control-allow-headers',
    getHeader(event, 'access-control-request-headers') || 'authorization,content-type'
  )

  if (event.method === 'OPTIONS') {
    setHeader(event, 'access-control-max-age', '86400')
    setResponseStatus(event, 204)
    return ''
  }
})
