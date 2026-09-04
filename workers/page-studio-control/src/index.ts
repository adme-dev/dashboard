const ALLOWED_DASHBOARD_ORIGINS = new Set([
  'https://app.xeroflow.io',
  'https://preview.agency-dashboard-6cm.pages.dev'
])
const ALLOWED_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'idempotency-key',
  'x-request-id'
] as const
const ALLOWED_RESPONSE_HEADERS = [
  'content-type',
  'retry-after',
  'x-request-id'
] as const
const MAX_SECRET_BYTES = 256
const MIN_SECRET_BYTES = 32
const PREVIEW_AUTHORIZATION_PATH = '/internal/page-studio/delivery/previews/authorize'
const PREVIEW_TOKEN_HEADER = 'x-xeroflow-preview-token'
const encoder = new TextEncoder()

interface GatewayConfiguration {
  dashboardOrigin: string
  secret: string
}

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    }
  )
}

function configuration(env: Env): GatewayConfiguration | null {
  const secretBytes = encoder.encode(env.PAGE_STUDIO_CONTROL_SECRET).byteLength
  if (secretBytes < MIN_SECRET_BYTES || secretBytes > MAX_SECRET_BYTES) return null

  try {
    const origin = new URL(env.DASHBOARD_ORIGIN)
    if (origin.origin !== env.DASHBOARD_ORIGIN
      || origin.protocol !== 'https:'
      || origin.username
      || origin.password
      || origin.pathname !== '/'
      || origin.search
      || origin.hash
      || !ALLOWED_DASHBOARD_ORIGINS.has(origin.origin)) return null
    return { dashboardOrigin: origin.origin, secret: env.PAGE_STUDIO_CONTROL_SECRET }
  } catch {
    return null
  }
}

function forwardedRequest(request: Request, config: GatewayConfiguration): Request {
  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, config.dashboardOrigin)
  const headers = new Headers()
  for (const name of ALLOWED_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  if (request.method === 'POST' && incomingUrl.pathname === PREVIEW_AUTHORIZATION_PATH) {
    const previewToken = request.headers.get(PREVIEW_TOKEN_HEADER)
    if (previewToken !== null) headers.set(PREVIEW_TOKEN_HEADER, previewToken)
  }
  headers.set('authorization', `Bearer ${config.secret}`)
  headers.set('x-xeroflow-service', 'page-studio')

  const retargeted = new Request(targetUrl, request)
  return new Request(retargeted, {
    headers,
    redirect: 'manual'
  })
}

function projectedResponse(upstream: Response): Response {
  const headers = new Headers({
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  })
  for (const name of ALLOWED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const config = configuration(env)
  if (!config) {
    return errorResponse(
      'CONTROL_GATEWAY_UNAVAILABLE',
      'Page Studio control gateway is not configured',
      503
    )
  }

  const url = new URL(request.url)
  if (url.pathname === '/healthz') {
    if (request.method !== 'GET') {
      const response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405)
      response.headers.set('allow', 'GET')
      return response
    }
    return Response.json(
      { ok: true, service: 'page-studio-control' },
      { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }
    )
  }
  if (!url.pathname.startsWith('/internal/page-studio/')) {
    return errorResponse('NOT_FOUND', 'Not found', 404)
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    const response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405)
    response.headers.set('allow', 'GET, POST')
    return response
  }

  let upstream: Response
  try {
    upstream = await fetch(forwardedRequest(request, config))
  } catch (error) {
    console.error(JSON.stringify({
      event: 'page_studio_control_upstream_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
      method: request.method,
      path: url.pathname
    }))
    return errorResponse(
      'CONTROL_UPSTREAM_UNAVAILABLE',
      'Page Studio control unavailable',
      503
    )
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    console.error(JSON.stringify({
      event: 'page_studio_control_upstream_redirect_rejected',
      method: request.method,
      path: url.pathname,
      status: upstream.status
    }))
    return errorResponse(
      'CONTROL_UPSTREAM_INVALID',
      'Page Studio control returned an invalid response',
      502
    )
  }
  return projectedResponse(upstream)
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  }
} satisfies ExportedHandler<Env>
