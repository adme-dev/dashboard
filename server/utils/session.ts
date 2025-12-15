import type { H3Event } from 'h3'
import { queryOne, query } from './db'

// XeroTokenSet is imported from xeroClient.ts to avoid duplication
import type { XeroTokenSet } from './xeroClient'

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

/**
 * Set selected tenant - stores in both cookie (for quick access) and Postgres (for persistence)
 */
export async function setSelectedTenant(event: H3Event, tenantId: string, tenantName?: string) {
  // Set cookie for quick access
  setCookie(event, TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365
  })

  // Also persist to Postgres if tenant name is provided
  if (tenantName) {
    const sid = getOrCreateSessionId(event)
    await query(`
      INSERT INTO xero_tenants (session_id, tenant_id, tenant_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (session_id)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        tenant_name = EXCLUDED.tenant_name,
        updated_at = NOW()
    `, [sid, tenantId, tenantName])
  }
}

export function getSelectedTenant(event: H3Event): string | undefined {
  return getCookie(event, TENANT_COOKIE)
}

/**
 * Get selected tenant with name from Postgres
 */
export async function getSelectedTenantWithName(event: H3Event): Promise<{ tenantId: string; tenantName: string } | undefined> {
  const sid = getOrCreateSessionId(event)

  const row = await queryOne<{ tenant_id: string; tenant_name: string }>(`
    SELECT tenant_id, tenant_name
    FROM xero_tenants
    WHERE session_id = $1
  `, [sid])

  if (!row) {
    // Fallback to cookie
    const tenantId = getCookie(event, TENANT_COOKIE)
    if (tenantId) {
      return { tenantId, tenantName: 'Unknown' }
    }
    return undefined
  }

  return {
    tenantId: row.tenant_id,
    tenantName: row.tenant_name
  }
}

export function clearSelectedTenant(event: H3Event) {
  deleteCookie(event, TENANT_COOKIE, { path: '/' })
}
