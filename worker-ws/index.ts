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

import { neon } from '@neondatabase/serverless'

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

  const sql = neon(env.DATABASE_URL)
  const rows = UUID_RE.test(boardIdOrSlug)
    ? (await sql`SELECT id FROM departments WHERE id = ${boardIdOrSlug}::uuid` as Array<{ id: string }>)
    : (await sql`SELECT id FROM departments WHERE slug = ${boardIdOrSlug}` as Array<{ id: string }>)
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
  const token = getCookie(request, 'auth_token') || getCookie(request, 'auth_token_client')
  if (!token) {
    logAuthDenied(request, 'missing_auth_cookie')
    return null
  }

  const payload = await verifyJwt(token, env.JWT_SECRET)
  if (!payload?.userId) {
    logAuthDenied(request, 'invalid_session_token', {
      jwtSecretConfigured: Boolean(env.JWT_SECRET)
    })
    return null
  }

  try {
    const sql = neon(env.DATABASE_URL)
    const rows = await sql`
      SELECT id, name, avatar_url
      FROM team_members
      WHERE id = ${payload.userId} AND is_active = true
      LIMIT 1
    ` as Array<AuthedUser>
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

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim()
    }
  }
  return null
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
