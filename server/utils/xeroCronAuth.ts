/**
 * Xero auth for cron/background jobs (no H3 event / KV context).
 *
 * Tokens can live on two rows of xero_org_connection:
 *   • the tenant row — written by the OAuth callback (and, since the
 *     tenant-aware fix, by web-request refreshes in tokenStore), and
 *   • the '__default__' row — written by older web-request refreshes and as
 *     a fallback when the tenant is unknown.
 *
 * Xero refresh tokens are single-use, so only the most recently refreshed row
 * holds a live refresh token. Reading the tenant row alone (the old cron
 * pattern) 401s with "Refresh token has been consumed" as soon as a web
 * request has refreshed once. This helper:
 *   1. resolves the real tenant id from the newest non-default row,
 *   2. takes credentials from the newest row overall,
 *   3. refreshes when near/past expiry, and
 *   4. persists the refreshed token to BOTH rows so web requests and future
 *      cron runs stay on the live chain.
 */

import { queryOne, execute } from './db'
import { refreshXeroToken, type XeroTokenSet } from './xeroClient'

interface XeroOrgRow {
  tenant_id: string
  access_token: string
  refresh_token: string | null
  // BIGINT in Postgres — comes back as string from `pg`; coerce before math.
  expires_at: string | number | null
}

export interface CronXeroAuth {
  tenantId: string
  accessToken: string
}

export async function resolveCronXeroAuth(label: string): Promise<CronXeroAuth | null> {
  const tenantRow = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM xero_org_connection
      WHERE tenant_id != '__default__'
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
  if (!tenantRow) return null

  const tokenRow = await queryOne<XeroOrgRow>(
    `SELECT tenant_id, access_token, refresh_token, expires_at
       FROM xero_org_connection
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
  if (!tokenRow?.access_token) return null

  let accessToken = tokenRow.access_token
  const expiresAtMs = tokenRow.expires_at != null ? Number(tokenRow.expires_at) : 0
  const nearExpiry = expiresAtMs <= 0 || expiresAtMs - Date.now() < 5 * 60 * 1000

  if (tokenRow.refresh_token && nearExpiry) {
    try {
      const refreshed: XeroTokenSet = await refreshXeroToken({ refreshToken: tokenRow.refresh_token })
      accessToken = refreshed.access_token!
      await execute(
        `UPDATE xero_org_connection SET
           access_token = $1,
           refresh_token = $2,
           expires_at = $3,
           updated_at = NOW()
         WHERE tenant_id IN ($4, '__default__')`,
        [
          refreshed.access_token,
          refreshed.refresh_token ?? tokenRow.refresh_token,
          refreshed.expires_at ?? null,
          tenantRow.tenant_id,
        ],
      )
    } catch (err: any) {
      // Don't bail — try the existing token; worst case the Xero call 401s
      // and the sync result records it.
      console.warn(`[${label}] token refresh failed:`, err?.message)
    }
  }

  return { tenantId: tenantRow.tenant_id, accessToken }
}
