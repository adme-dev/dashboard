import type { H3Event } from 'h3'

export type XeroTokenSet = {
  access_token: string
  refresh_token: string
  expires_at: number
  scope?: string
  token_type?: string
}

const TOKEN_KEY_PREFIX = 'xero:session:'

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
