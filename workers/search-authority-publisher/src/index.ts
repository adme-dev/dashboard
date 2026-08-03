import type { SearchAuthorityPublicationManifest, SearchAuthorityPublicationRoute } from '../../../shared/searchAuthorityPublication'

const MAX_MANIFEST_BYTES = 64 * 1024
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const CONTENT_TYPES = new Set([
  'text/html; charset=utf-8',
  'application/xml; charset=utf-8',
  'text/plain; charset=utf-8'
])

const publisher = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env)
    } catch (error: unknown) {
      console.error(JSON.stringify({
        message: 'search authority publisher request failed',
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
      return response('Service unavailable', 503, 'text/plain; charset=utf-8')
    }
  }
} satisfies ExportedHandler<Env>

export default publisher

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const result = response('Method not allowed', 405, 'text/plain; charset=utf-8')
    result.headers.set('allow', 'GET, HEAD')
    return result
  }
  const url = new URL(request.url)
  if (url.pathname === '/healthz') {
    return response(request.method === 'HEAD' ? null : JSON.stringify({ ok: true }), 200, 'application/json; charset=utf-8')
  }
  const hostname = url.hostname.toLowerCase()
  if (!HOSTNAME.test(hostname)) return notFound(request.method)
  const manifestObject = await env.PUBLICATIONS.get(`hosts/${hostname}/manifests/current.json`)
  if (!manifestObject) return notFound(request.method)
  if ('size' in manifestObject && typeof manifestObject.size === 'number' && manifestObject.size > MAX_MANIFEST_BYTES) {
    throw new Error('Publication manifest exceeds the bounded size')
  }
  const parsed: unknown = JSON.parse(await manifestObject.text())
  const manifest = validateManifest(parsed, hostname)
  if (!manifest) return notFound(request.method)

  const redirect = manifest.redirects[url.pathname]
  if (redirect) {
    if (!isPublicPath(redirect) || !manifest.routes[redirect]) return notFound(request.method)
    const result = new Response(null, { status: 302, headers: { location: `https://${hostname}${redirect}` } })
    applySecurityHeaders(result.headers)
    result.headers.set('cache-control', 'public, max-age=60, s-maxage=60')
    return result
  }
  const route = manifest.routes[url.pathname]
  if (!route) return notFound(request.method)
  const object = request.method === 'HEAD'
    ? await env.PUBLICATIONS.head(route.key)
    : await env.PUBLICATIONS.get(route.key)
  if (!object) throw new Error('Published object is unavailable')

  const etag = `"${route.etag}"`
  if (request.headers.get('if-none-match') === etag) {
    const result = new Response(null, { status: 304, headers: { etag } })
    applySecurityHeaders(result.headers)
    return result
  }
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('content-type', route.contentType)
  headers.set('etag', etag)
  headers.set('cache-control', route.contentType.startsWith('text/html')
    ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
    : 'public, max-age=300, s-maxage=300')
  applySecurityHeaders(headers)
  const body: ReadableStream | null = request.method === 'HEAD'
    ? null
    : (object as R2ObjectBody).body
  return new Response(body, { status: 200, headers })
}

function validateManifest(value: unknown, hostname: string): SearchAuthorityPublicationManifest | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== 1 || record.hostname !== hostname
    || typeof record.manifestVersion !== 'string'
    || typeof record.publicationId !== 'string'
    || typeof record.versionId !== 'string'
    || typeof record.activatedAt !== 'string'
    || !record.routes || typeof record.routes !== 'object'
    || !record.redirects || typeof record.redirects !== 'object') return null

  const routes: Record<string, SearchAuthorityPublicationRoute> = {}
  for (const [path, routeValue] of Object.entries(record.routes as Record<string, unknown>)) {
    if (!isPublicPath(path) || !routeValue || typeof routeValue !== 'object') return null
    const route = routeValue as Record<string, unknown>
    if (typeof route.key !== 'string'
      || !route.key.startsWith(`hosts/${hostname}/versions/`)
      || route.key.includes('..')
      || typeof route.contentType !== 'string'
      || !CONTENT_TYPES.has(route.contentType)
      || typeof route.etag !== 'string'
      || !/^[a-zA-Z0-9-]{4,128}$/.test(route.etag)) return null
    routes[path] = {
      key: route.key,
      contentType: route.contentType as SearchAuthorityPublicationRoute['contentType'],
      etag: route.etag
    }
  }
  const redirects: Record<string, string> = {}
  for (const [from, to] of Object.entries(record.redirects as Record<string, unknown>)) {
    if (!isPublicPath(from) || typeof to !== 'string' || !isPublicPath(to)) return null
    redirects[from] = to
  }
  return {
    schemaVersion: 1,
    hostname,
    manifestVersion: record.manifestVersion,
    publicationId: record.publicationId,
    versionId: record.versionId,
    activatedAt: record.activatedAt,
    routes,
    redirects
  }
}

function isPublicPath(path: string): boolean {
  return path === '/'
    || path === '/sitemap.xml'
    || path === '/robots.txt'
    || /^\/guides\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)
}

function notFound(method: string): Response {
  return response(method === 'HEAD' ? null : 'Not found', 404, 'text/plain; charset=utf-8')
}

function response(body: BodyInit | null, status: number, contentType: string): Response {
  const result = new Response(body, { status, headers: { 'content-type': contentType } })
  applySecurityHeaders(result.headers)
  result.headers.set('cache-control', status === 404
    ? 'public, max-age=30, s-maxage=30'
    : 'no-store')
  return result
}

function applySecurityHeaders(headers: Headers): void {
  headers.set('content-security-policy', 'default-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' https: data:; script-src https://app.xeroflow.io; connect-src https://app.xeroflow.io; object-src \'none\'; base-uri \'none\'; frame-ancestors \'none\'; form-action \'self\'')
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-frame-options', 'DENY')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
}
