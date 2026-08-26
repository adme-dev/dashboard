import type { SearchAuthorityHostAlias, SearchAuthorityPublicationManifest, SearchAuthorityPublicationRoute, SearchAuthorityPublishedGuide } from '../../../shared/searchAuthorityPublication'

const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_ALIAS_BYTES = 1024
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
/** Same-host clients rewrite `/guides/*` to `https://publish.<zone>/s/<publicId>/guides/*`. */
const SAME_HOST_PREFIX = /^\/s\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(\/.*)?$/i
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
  let hostname = url.hostname.toLowerCase()
  let pathname = url.pathname
  let publicId: string | null = null

  // Same-host mode: the client's platform rewrites `/guides/*` here with a per-site prefix.
  const sameHost = SAME_HOST_PREFIX.exec(pathname)
  if (sameHost) {
    publicId = sameHost[1]!.toLowerCase()
    const aliasObject = await env.PUBLICATIONS.get(`aliases/${publicId}.json`)
    if (!aliasObject) return notFound(request.method)
    if ('size' in aliasObject && typeof aliasObject.size === 'number' && aliasObject.size > MAX_ALIAS_BYTES) {
      throw new Error('Host alias exceeds the bounded size')
    }
    const alias = validateAlias(JSON.parse(await aliasObject.text()))
    if (!alias) return notFound(request.method)
    hostname = alias.hostname
    pathname = sameHost[2] || '/'
    if (pathname === '/guides/healthz') {
      const result = response(request.method === 'HEAD' ? null : JSON.stringify({ ok: true, publicId }), 200, 'application/json; charset=utf-8')
      result.headers.set('x-xeroflow-publisher', publicId)
      return result
    }
  }
  if (!HOSTNAME.test(hostname)) return notFound(request.method)
  const manifestObject = await env.PUBLICATIONS.get(`hosts/${hostname}/manifests/current.json`)
  if (!manifestObject) return notFound(request.method)
  if ('size' in manifestObject && typeof manifestObject.size === 'number' && manifestObject.size > MAX_MANIFEST_BYTES) {
    throw new Error('Publication manifest exceeds the bounded size')
  }
  const parsed: unknown = JSON.parse(await manifestObject.text())
  const manifest = validateManifest(parsed, hostname)
  if (!manifest) return notFound(request.method)

  if (manifest.publicId && publicId && manifest.publicId !== publicId) return notFound(request.method)
  const redirect = manifest.redirects[pathname]
  if (redirect) {
    if (!isPublicPath(redirect) || !manifest.routes[redirect]) return notFound(request.method)
    const result = new Response(null, { status: 302, headers: { location: `https://${hostname}${redirect}` } })
    applySecurityHeaders(result.headers)
    result.headers.set('cache-control', 'public, max-age=60, s-maxage=60')
    return result
  }
  const route = manifest.routes[pathname]
  if (!route) return notFound(request.method)
  const object = request.method === 'HEAD'
    ? await env.PUBLICATIONS.head(route.key)
    : await env.PUBLICATIONS.get(route.key)
  if (!object) throw new Error('Published object is unavailable')

  const etag = `"${route.etag}"`
  if (request.headers.get('if-none-match') === etag) {
    const result = new Response(null, { status: 304, headers: { etag } })
    applySecurityHeaders(result.headers)
    if (manifest.publicId) result.headers.set('x-xeroflow-publisher', manifest.publicId)
    return result
  }
  const headers = new Headers()
  if (manifest.publicId) headers.set('x-xeroflow-publisher', manifest.publicId)
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
  const manifest: SearchAuthorityPublicationManifest = {
    schemaVersion: 1,
    hostname,
    manifestVersion: record.manifestVersion,
    publicationId: record.publicationId,
    versionId: record.versionId,
    activatedAt: record.activatedAt,
    routes,
    redirects
  }
  if (typeof record.publicId === 'string') {
    if (!UUID.test(record.publicId)) return null
    manifest.publicId = record.publicId.toLowerCase()
  }
  if (record.mode === 'subdomain' || record.mode === 'same_host') manifest.mode = record.mode
  if (Array.isArray(record.guides)) {
    const guides: SearchAuthorityPublishedGuide[] = []
    for (const item of record.guides as unknown[]) {
      if (!item || typeof item !== 'object') return null
      const guide = item as Record<string, unknown>
      if (typeof guide.slug !== 'string' || typeof guide.title !== 'string'
        || typeof guide.excerpt !== 'string' || typeof guide.publishedAt !== 'string') return null
      guides.push({ slug: guide.slug, title: guide.title, excerpt: guide.excerpt, publishedAt: guide.publishedAt })
    }
    manifest.guides = guides
  }
  return manifest
}

function validateAlias(value: unknown): SearchAuthorityHostAlias | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.hostname !== 'string' || !HOSTNAME.test(record.hostname.toLowerCase())) return null
  if (record.mode !== 'subdomain' && record.mode !== 'same_host') return null
  return { hostname: record.hostname.toLowerCase(), mode: record.mode }
}

function isPublicPath(path: string): boolean {
  return path === '/'
    || path === '/guides'
    || path === '/sitemap.xml'
    || path === '/guides/sitemap.xml'
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
