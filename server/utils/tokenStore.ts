import { createError, type H3Event } from 'h3'
import { refreshXeroToken, type XeroTokenSet } from './xeroClient'
import { queryOne, query } from './db'
import { kvGet, kvPut, kvDelete } from './kv'

const TOKEN_TTL = 25 * 60   // 25 minutes (tokens expire at 30 min)

const ORG_TOKEN_KV_KEY = 'xero-org-token'
const ORG_TENANT_KV_KEY = 'xero-org-tenant'

// ─── Org-level token storage ─────────────────────────────────────────

/**
 * Store Xero tokens at org level — one connection shared by all team members.
 * The person who connects Xero (bookkeeper/owner) sets the token once.
 */
export async function setOrgToken(event: H3Event, token: XeroTokenSet, opts?: { tenantId?: string; tenantName?: string; connectedBy?: string }) {
  // Write to KV for fast reads
  kvPut(event, ORG_TOKEN_KV_KEY, token, TOKEN_TTL)

  const tenantId = opts?.tenantId || ''
  const tenantName = opts?.tenantName || ''

  await query(`
    INSERT INTO xero_org_connection (tenant_id, tenant_name, access_token, refresh_token, id_token, expires_at, scope, token_type, connected_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      tenant_name = EXCLUDED.tenant_name,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      id_token = EXCLUDED.id_token,
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      token_type = EXCLUDED.token_type,
      updated_at = NOW()
  `, [
    tenantId || '__default__',
    tenantName,
    token.access_token,
    token.refresh_token,
    token.id_token,
    token.expires_at,
    token.scope,
    token.token_type,
    opts?.connectedBy || null
  ])
}

/** Read the newest token row straight from the DB, bypassing KV. */
async function readOrgTokenFromDb(): Promise<XeroTokenSet | undefined> {
  const row = await queryOne<{
    access_token: string
    refresh_token: string | null
    id_token: string | null
    expires_at: string | number
    scope: string | null
    token_type: string | null
  }>(`
    SELECT access_token, refresh_token, id_token, expires_at, scope, token_type
    FROM xero_org_connection
    ORDER BY updated_at DESC
    LIMIT 1
  `)

  if (!row) return undefined

  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token || undefined,
    id_token: row.id_token || undefined,
    expires_at: typeof row.expires_at === 'number' ? row.expires_at : Number(row.expires_at),
    scope: row.scope || undefined,
    token_type: row.token_type || 'Bearer'
  } as XeroTokenSet
}

export async function getOrgToken(event: H3Event): Promise<XeroTokenSet | undefined> {
  // Check KV first
  const cached = await kvGet<XeroTokenSet>(event, ORG_TOKEN_KV_KEY)
  if (cached) return cached

  // Fall back to DB — get the most recently updated connection
  const token = await readOrgTokenFromDb()
  if (!token) return undefined

  // Backfill KV
  kvPut(event, ORG_TOKEN_KV_KEY, token, TOKEN_TTL)

  return token
}

export async function clearOrgToken(event: H3Event, tenantId?: string) {
  kvDelete(event, ORG_TOKEN_KV_KEY)
  kvDelete(event, ORG_TENANT_KV_KEY)
  if (tenantId) {
    await query('DELETE FROM xero_org_connection WHERE tenant_id = $1', [tenantId])
  } else {
    await query('DELETE FROM xero_org_connection')
  }
}

export async function getOrgTenant(event: H3Event): Promise<{ tenantId: string; tenantName: string } | undefined> {
  const cached = await kvGet<{ tenantId: string; tenantName: string }>(event, ORG_TENANT_KV_KEY)
  if (cached) return cached

  const row = await queryOne<{ tenant_id: string; tenant_name: string }>(`
    SELECT tenant_id, tenant_name
    FROM xero_org_connection
    WHERE tenant_id != '__default__'
    ORDER BY updated_at DESC
    LIMIT 1
  `)

  if (!row) return undefined

  const tenant = { tenantId: row.tenant_id, tenantName: row.tenant_name }
  kvPut(event, ORG_TENANT_KV_KEY, tenant, 60 * 60)
  return tenant
}

export async function setOrgTenant(event: H3Event, tenantId: string, tenantName: string) {
  kvPut(event, ORG_TENANT_KV_KEY, { tenantId, tenantName }, 60 * 60)

  // Update existing connection row or insert
  await query(`
    INSERT INTO xero_org_connection (tenant_id, tenant_name, access_token, refresh_token, expires_at)
    SELECT $1, $2, access_token, refresh_token, expires_at
    FROM xero_org_connection
    ORDER BY updated_at DESC LIMIT 1
    ON CONFLICT (tenant_id)
    DO UPDATE SET tenant_name = EXCLUDED.tenant_name, updated_at = NOW()
  `, [tenantId, tenantName])
}

/**
 * Get an active (non-expired) org token, auto-refreshing if needed.
 * This is the main entry point for all Xero API calls.
 */
export async function getActiveOrgToken(event: H3Event, opts: { minTtlMs?: number } = {}): Promise<XeroTokenSet> {
  const windowMs = typeof opts.minTtlMs === 'number' ? opts.minTtlMs : 300_000
  const token = await getOrgToken(event)
  if (!token?.access_token) {
    throw createError({ statusCode: 401, statusMessage: 'Not connected to Xero' })
  }

  const now = Date.now()
  if (token.expires_at > now + windowMs) {
    return token
  }

  if (!token.refresh_token) {
    await clearOrgToken(event)
    throw createError({ statusCode: 401, statusMessage: 'Xero session expired, please reconnect' })
  }

  // Each request refreshes independently — no module-level lock.
  // A cross-request promise lock would crash on Cloudflare Pages with
  // "Cannot perform I/O on behalf of a different request" (CF error 1101).
  // Two concurrent refreshes are rare (KV cache covers most reads), and
  // if one loses the refresh-token rotation race we re-read in case the
  // winner already wrote a fresh token to KV/DB.
  try {
    const next = await refreshXeroToken({
      refreshToken: token.refresh_token!,
      event
    })
    // Write the refreshed token to the TENANT row (not '__default__') so
    // background jobs reading the tenant row stay on the live refresh-token
    // chain — Xero refresh tokens are single-use, so a fork here strands
    // every other reader with a consumed token.
    const tenant = await getOrgTenant(event)
    await setOrgToken(event, next, tenant
      ? { tenantId: tenant.tenantId, tenantName: tenant.tenantName }
      : undefined)
    return next
  } catch (err: any) {
    // Re-read straight from the DB — NOT via getOrgToken/KV: this request may
    // have just backfilled KV with the very token whose refresh lost the
    // race, which would make the winner invisible and trigger a spurious
    // clearOrgToken() below (wiping a healthy connection).
    const winner = await readOrgTokenFromDb()
    if (
      winner?.access_token
      && winner.access_token !== token.access_token
      && winner.expires_at > Date.now() + 5_000
    ) {
      kvPut(event, ORG_TOKEN_KV_KEY, winner, TOKEN_TTL)
      return winner
    }

    // Only wipe the connection when Xero gave a *definitive* "this refresh
    // token is dead" response. Anything else (network blip, 5xx, timeout,
    // rate-limit) is transient — keep the row so the user can retry without
    // having to re-OAuth.
    //
    // refreshXeroToken throws createError with the upstream status + body
    // baked into statusMessage. invalid_grant is the only OAuth error that
    // means the refresh token itself is dead. revoked + expired both
    // surface that way too.
    const msg = String(err?.statusMessage ?? err?.message ?? '')
    const definitivelyDead =
      msg.includes('invalid_grant')
      || msg.includes('invalid_request')
      || msg.includes('unauthorized_client')
      || /\bfailed:\s*4\d\d\b/.test(msg)  // any 4xx response from token endpoint

    if (definitivelyDead) {
      await clearOrgToken(event)
      throw createError({
        statusCode: 401,
        statusMessage: 'Xero session expired, please reconnect',
      })
    }

    // Transient — keep the saved row + bubble a 503 so the caller knows
    // to retry rather than treat this as "user logged out".
    console.warn('[tokenStore] transient Xero refresh failure, keeping connection:', msg)
    throw createError({
      statusCode: 503,
      statusMessage: 'Could not refresh Xero token (transient) — try again in a moment',
    })
  }
}

// ─── Backward-compatible aliases ─────────────────────────────────────
// These map the old session-based API to the new org-level API.
// All existing endpoints (invoices, expenses, reports, etc.) that call
// getActiveTokenForSession() will now use the shared org token.

export const setTokenForSession = (event: H3Event, token: XeroTokenSet) => setOrgToken(event, token)
export const getTokenForSession = (event: H3Event) => getOrgToken(event)
export const clearTokenForSession = (event: H3Event) => clearOrgToken(event)
export const getActiveTokenForSession = (event: H3Event, opts?: { minTtlMs?: number }) => getActiveOrgToken(event, opts)

// Legacy session ID helpers — kept for any code that still references them
export function getSessionId(event: H3Event): string {
  let sid = getCookie(event, 'sid')
  if (!sid) {
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as any).randomUUID()
      : Math.random().toString(36).slice(2)
    sid = random
    setCookie(event, 'sid', sid!, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/'
    })
  }
  return sid!
}
