import { createError, type H3Event } from 'h3'
import { createXeroClient, toStoredTokenSet, type XeroTokenSet } from './xeroClient'
import { queryOne, query } from './db'

const refreshLocks = new Map<string, Promise<XeroTokenSet>>()

/**
 * Store Xero tokens in Postgres for persistence across restarts
 */
export async function setTokenForSession(event: H3Event, token: XeroTokenSet) {
  const sid = getSessionId(event)

  // Upsert the session - insert or update if exists
  await query(`
    INSERT INTO xero_sessions (session_id, access_token, refresh_token, id_token, expires_at, scope, token_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (session_id)
    DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      id_token = EXCLUDED.id_token,
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      token_type = EXCLUDED.token_type,
      updated_at = NOW()
  `, [
    sid,
    token.access_token,
    token.refresh_token,
    token.id_token,
    new Date(token.expires_at),
    token.scope,
    token.token_type
  ])
}

export async function getTokenForSession(event: H3Event): Promise<XeroTokenSet | undefined> {
  const sid = getSessionId(event)

  const row = await queryOne<{
    access_token: string
    refresh_token: string | null
    id_token: string | null
    expires_at: Date
    scope: string | null
    token_type: string | null
  }>(`
    SELECT access_token, refresh_token, id_token, expires_at, scope, token_type
    FROM xero_sessions
    WHERE session_id = $1
  `, [sid])

  if (!row) return undefined

  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token || undefined,
    id_token: row.id_token || undefined,
    expires_at: new Date(row.expires_at).getTime(),
    scope: row.scope || undefined,
    token_type: row.token_type || 'Bearer'
  }
}

export async function clearTokenForSession(event: H3Event) {
  const sid = getSessionId(event)
  await query('DELETE FROM xero_sessions WHERE session_id = $1', [sid])
}

/**
 * Store the selected tenant for a session
 */
export async function setTenantForSession(event: H3Event, tenantId: string, tenantName: string) {
  const sid = getSessionId(event)

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

export async function getTenantForSession(event: H3Event): Promise<{ tenantId: string; tenantName: string } | undefined> {
  const sid = getSessionId(event)

  const row = await queryOne<{ tenant_id: string; tenant_name: string }>(`
    SELECT tenant_id, tenant_name
    FROM xero_tenants
    WHERE session_id = $1
  `, [sid])

  if (!row) return undefined

  return {
    tenantId: row.tenant_id,
    tenantName: row.tenant_name
  }
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
      const client = await createXeroClient({ tokenSet: token, event })
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
