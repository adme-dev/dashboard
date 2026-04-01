import type { H3Event } from 'h3'
import { getOrgTenant, setOrgTenant } from './tokenStore'

export function getOrCreateSessionId(event: H3Event): string {
  let sid = getCookie(event, 'sid')
  if (!sid) {
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as any).randomUUID()
      : Math.random().toString(36).slice(2)
    sid = random as string
    setCookie(event, 'sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/'
    })
  }
  return sid as string
}

/**
 * Set selected tenant — now stores at org level so all team members share it.
 */
export async function setSelectedTenant(event: H3Event, tenantId: string, tenantName?: string) {
  // Also set cookie for quick access (backward compat)
  setCookie(event, 'xero_tenant_id', tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 365
  })

  await setOrgTenant(event, tenantId, tenantName || '')
}

export function getSelectedTenant(event: H3Event): string | undefined {
  return getCookie(event, 'xero_tenant_id')
}

/**
 * Get selected tenant with name — reads from org-level storage.
 */
export async function getSelectedTenantWithName(event: H3Event): Promise<{ tenantId: string; tenantName: string } | undefined> {
  // Try org-level storage first
  const orgTenant = await getOrgTenant(event)
  if (orgTenant) return orgTenant

  // Fallback to cookie
  const tenantId = getCookie(event, 'xero_tenant_id')
  if (tenantId) {
    return { tenantId, tenantName: 'Unknown' }
  }
  return undefined
}

export function clearSelectedTenant(event: H3Event) {
  deleteCookie(event, 'xero_tenant_id', { path: '/' })
}
