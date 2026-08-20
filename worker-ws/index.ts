/**
 * WebSocket upgrade handler — runs ahead of Nitro.
 *
 * Why this exists: Nitro's cloudflare_pages preset reconstructs incoming
 * requests via `nitroApp.localFetch(...)` (which round-trips through Node-style
 * IncomingMessage / ServerResponse polyfills). That path strips forbidden
 * upgrade headers (Connection, Upgrade, Sec-WebSocket-*) and discards the
 * `webSocket` property on returned 101 Responses, so a Nitro handler cannot
 * proxy a WebSocket upgrade to a Durable Object. This module is invoked by
 * `dist/_worker.js/index.js` BEFORE Nitro for upgrade requests on the three
 * known WS paths and forwards them directly to the appropriate DO.
 */

interface Env {
  BOARD_ROOMS: DurableObjectNamespace
  CHAT_ROOMS: DurableObjectNamespace
  BANNER_ROOMS: DurableObjectNamespace
  DATABASE_URL: string
  JWT_SECRET: string
}

interface JwtPayload {
  userId?: string
  exp?: number
}

interface AuthedUser {
  id: string
  name: string
  avatar_url: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_AUTH_COOKIE_CANDIDATES = 4

/**
 * Tiny Neon HTTP query adapter for the pre-Nitro WebSocket boundary. Bundling
 * the full Postgres client into the separate WS entry duplicates ~140 KB that
 * already exists in Nitro and can push the Pages multipart over its raw limit.
 * These two lookups only need raw text rows, so use Neon's documented HTTP
 * protocol directly and keep the edge entry self-contained.
 */
async function queryNeon<T extends object>(
  connectionString: string,
  query: string,
  params: unknown[]
): Promise<T[]> {
  const connection = new URL(connectionString)
  const endpointHost = connection.hostname.replace(/^[^.]+\./, 'api.')
  if (!endpointHost.startsWith('api.')) throw new Error('Unsupported Neon database host')
  const response = await fetch(`https://${endpointHost}/sql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Neon-Connection-String': connectionString,
      'Neon-Raw-Text-Output': 'true',
      'Neon-Array-Mode': 'true'
    },
    body: JSON.stringify({ query, params })
  })
  const payload = await response.json().catch(() => null) as {
    fields?: Array<{ name?: unknown }>
    rows?: unknown[][]
    message?: unknown
    code?: unknown
  } | null
  if (!response.ok || !Array.isArray(payload?.fields) || !Array.isArray(payload?.rows)) {
    const error = Object.assign(new Error('Neon HTTP query failed'), {
      code: typeof payload?.code === 'string' ? payload.code : String(response.status)
    })
    throw error
  }
  const fields = payload.fields.map(field => String(field.name ?? ''))
  return payload.rows.map(row => Object.fromEntries(fields.map((field, index) => [field, row[index]])) as T)
}

export async function handleBoardConnect(
  request: Request,
  env: Env,
  boardIdOrSlug: string,
): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }
  const user = await authenticate(request, env)
  if (!user) return unauthorized()

  const rows = UUID_RE.test(boardIdOrSlug)
    ? await queryNeon<{ id: string }>(env.DATABASE_URL, 'SELECT id FROM departments WHERE id = $1::uuid', [boardIdOrSlug])
    : await queryNeon<{ id: string }>(env.DATABASE_URL, 'SELECT id FROM departments WHERE slug = $1', [boardIdOrSlug])
  const boardId = rows[0]?.id
  if (!boardId) return new Response('Board not found', { status: 404 })

  return forwardToDO(request, env.BOARD_ROOMS, boardId, `https://board-do/board/${boardId}`, user)
}

export async function handleChatConnect(
  request: Request,
  env: Env,
  channelId: string,
): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }
  const user = await authenticate(request, env)
  if (!user) return unauthorized()
  return forwardToDO(request, env.CHAT_ROOMS, channelId, `https://chat-do/chat/${channelId}`, user)
}

export async function handleBannerConnect(
  request: Request,
  env: Env,
  projectId: string,
): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }
  const user = await authenticate(request, env)
  if (!user) return unauthorized()
  return forwardToDO(request, env.BANNER_ROOMS, projectId, `https://banner-do/banner/${projectId}`, user)
}

async function authenticate(request: Request, env: Env): Promise<AuthedUser | null> {
  const tokens = getCookieCandidates(request, ['auth_token', 'auth_token_client'])
  if (tokens.length === 0) {
    logAuthDenied(request, 'missing_auth_cookie')
    return null
  }

  let payload: JwtPayload | null = null
  for (const token of tokens) {
    const candidate = await verifyJwt(token, env.JWT_SECRET)
    if (candidate?.userId) {
      payload = candidate
      break
    }
  }
  if (!payload?.userId) {
    logAuthDenied(request, 'invalid_session_token', {
      jwtSecretConfigured: Boolean(env.JWT_SECRET)
    })
    return null
  }

  try {
    const rows = await queryNeon<AuthedUser>(env.DATABASE_URL, `
      SELECT id, name, avatar_url
      FROM team_members
      WHERE id = $1 AND is_active = true
      LIMIT 1
    `, [payload.userId])
    if (!rows[0]) {
      logAuthDenied(request, 'inactive_or_missing_user')
      return null
    }
    return rows[0]
  } catch (error) {
    const errorRecord = error && typeof error === 'object'
      ? error as { name?: unknown, code?: unknown }
      : null
    logAuthDenied(request, 'user_lookup_failed', {
      databaseUrlConfigured: Boolean(env.DATABASE_URL),
      errorName: typeof errorRecord?.name === 'string' ? errorRecord.name : 'UnknownError',
      errorCode: typeof errorRecord?.code === 'string' ? errorRecord.code : null
    }, 'error')
    return null
  }
}

type AuthDeniedReason
  = | 'missing_auth_cookie'
    | 'invalid_session_token'
    | 'inactive_or_missing_user'
    | 'user_lookup_failed'

function logAuthDenied(
  request: Request,
  reason: AuthDeniedReason,
  details: Record<string, unknown> = {},
  level: 'warn' | 'error' = 'warn'
): void {
  console[level]('realtime.auth.denied', {
    reason,
    path: new URL(request.url).pathname,
    ...details
  })
}

function forwardToDO(
  request: Request,
  ns: DurableObjectNamespace,
  doKey: string,
  upgradeUrl: string,
  user: AuthedUser,
): Promise<Response> {
  const id = ns.idFromName(doKey)
  const stub = ns.get(id)

  const url = new URL(upgradeUrl)
  url.searchParams.set('userId', user.id)
  url.searchParams.set('userName', user.name || 'Anonymous')
  if (user.avatar_url) {
    url.searchParams.set('userAvatar', user.avatar_url)
  }

  // CF Workers' Request constructor preserves forbidden upgrade headers when
  // the second arg is a Request (not an init dict). This is the documented
  // pattern for cloning a Worker request with a rewritten URL.
  const upgradeRequest = new Request(url.toString(), request)
  return stub.fetch(upgradeRequest)
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}

function getCookieCandidates(request: Request, names: readonly string[]): string[] {
  const header = request.headers.get('cookie')
  if (!header) return []
  const allowedNames = new Set(names)
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const part of header.split(';')) {
    if (candidates.length >= MAX_AUTH_COOKIE_CANDIDATES) break
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!allowedNames.has(name) || !value || seen.has(value)) continue
    seen.add(value)
    candidates.push(value)
  }
  return candidates
}

async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const dot = token.indexOf('.')
    if (dot <= 0 || dot === token.length - 1) return null
    const dataB64 = token.slice(0, dot)
    const sigB64 = token.slice(dot + 1)

    const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0))
    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0))

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const ok = await crypto.subtle.verify('HMAC', key, sig, data)
    if (!ok) return null

    const payload = JSON.parse(new TextDecoder().decode(data)) as JwtPayload
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
