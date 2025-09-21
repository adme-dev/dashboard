import { createError, type H3Event } from 'h3'
import { createXeroClient, toStoredTokenSet, type XeroTokenSet } from './xeroClient'

const TOKEN_KEY_PREFIX = 'xero:session:'
const refreshLocks = new Map<string, Promise<XeroTokenSet>>()

function buildKey(sessionId: string) {
  return `${TOKEN_KEY_PREFIX}${sessionId}`
}

export async function setTokenForSession(event: H3Event, token: XeroTokenSet) {
  const sid = getSessionId(event)
  const storage = useStorage()
  await storage.setItem(buildKey(sid), token)
}

export async function getTokenForSession(event: H3Event): Promise<XeroTokenSet | undefined> {
  const sid = getSessionId(event)
  const storage = useStorage()
  return await storage.getItem<XeroTokenSet>(buildKey(sid))
}

export async function clearTokenForSession(event: H3Event) {
  const sid = getSessionId(event)
  const storage = useStorage()
  await storage.removeItem(buildKey(sid))
}

export async function getActiveTokenForSession(event: H3Event, opts: { minTtlMs?: number } = {}): Promise<XeroTokenSet> {
  const windowMs = typeof opts.minTtlMs === 'number' ? opts.minTtlMs : 300_000
  const sid = getSessionId(event)
  const token = await getTokenForSession(event)
  if (!token?.access_token) {
    throw createError({ statusCode: 401, statusMessage: 'Not connected to Xero' })
  }

  const now = Date.now()
  if (token.expires_at > now + windowMs) {
    return token
  }

  if (!token.refresh_token) {
    await clearTokenForSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Xero session expired, please reconnect' })
  }
  if (refreshLocks.has(sid)) {
    return await refreshLocks.get(sid)!
  }

  const refreshPromise = (async () => {
    try {
      const client = await createXeroClient({ tokenSet: token })
      await client.refreshToken()
      const latest = client.readTokenSet()
      const next = toStoredTokenSet({
        ...latest,
        refresh_token: latest.refresh_token || token.refresh_token
      })
      await setTokenForSession(event, next)
      return next
    } catch (err) {
      await clearTokenForSession(event)
      throw createError({
        statusCode: 401,
        statusMessage: 'Failed to refresh Xero session'
      })
    } finally {
      refreshLocks.delete(sid)
    }
  })()

  refreshLocks.set(sid, refreshPromise)
  return await refreshPromise
}

export function getSessionId(event: H3Event): string {
  let sid = getCookie(event, 'sid')
  if (!sid) {
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as any).randomUUID()
      : Math.random().toString(36).slice(2)
    sid = random
    setCookie(event, 'sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    })
  }
  return sid
}
