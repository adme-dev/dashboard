import type { H3Event } from 'h3'
import { fetchXeroTenants } from '~~/server/utils/xeroClient'
import { getActiveOrgToken, getOrgTenant, setOrgTenant } from '~~/server/utils/tokenStore'

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

/**
 * Resolve the active Xero tenant ID.
 *
 * Preference order:
 *   1. `xero_tenant_id` cookie (fast path, set by callback / select-tenant)
 *   2. Org-level tenant stored in KV / `xero_org_connection` DB table
 *   3. The sole organisation returned by Xero, persisted for future requests
 *
 * The org-level fallback is critical: the Xero connection is shared across
 * all team members, but only the user who completed OAuth has the cookie.
 * Without the fallback, every other user's Xero-backed endpoint 400s with
 * "No organization selected".
 */
export async function getSelectedTenant(event: H3Event): Promise<string | undefined> {
  const cookieTenant = getCookie(event, 'xero_tenant_id')
  if (cookieTenant) return cookieTenant

  const orgTenant = await getOrgTenant(event)
  if (orgTenant) return orgTenant.tenantId

  try {
    const token = await getActiveOrgToken(event, { minTtlMs: 0 })
    if (!token.access_token) return undefined

    const tenants = await fetchXeroTenants(token.access_token)
    const tenant = tenants.length === 1 ? tenants[0] : undefined
    if (tenant) {
      await setSelectedTenant(event, tenant.tenantId, tenant.tenantName)
      return tenant.tenantId
    }
  } catch {
    // Missing/expired Xero connection or a transient upstream failure. Callers
    // retain the existing "no organization selected" behavior and can retry.
  }

  return undefined
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
