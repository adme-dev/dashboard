import type { H3Event } from 'h3'

// XeroTokenSet is imported from xeroClient.ts to avoid duplication
import type { XeroTokenSet } from './xeroClient'

const tokenStore = new Map<string, XeroTokenSet>()

export function getOrCreateSessionId(event: H3Event): string {
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

const TENANT_COOKIE = 'xero_tenant_id'

export function setSelectedTenant(event: H3Event, tenantId: string) {
  setCookie(event, TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365
  })
}

export function getSelectedTenant(event: H3Event): string | undefined {
  return getCookie(event, TENANT_COOKIE)
}

export function clearSelectedTenant(event: H3Event) {
  deleteCookie(event, TENANT_COOKIE, { path: '/' })
}
