// server/api/cron/xero-customer-sync.post.ts
//
// Cron entrypoint for the Xero customer cache + rollup refresh.
// Configure a Cloudflare Cron Trigger of `*/15 * * * *` (every 15 minutes)
// pointing at this endpoint with header `x-cron-secret: $CRON_SECRET`.
//
// Behaviour:
//  • Resolves the connected Xero org from xero_org_connection.
//  • Refreshes the access token if it's near expiry.
//  • Runs a delta sync (modifiedAfter = last successful run) by default.
//    Pass ?full=true to force a from-scratch resync — useful for the
//    initial backfill and after schema additions.
//
// Auth: x-cron-secret header matched against CRON_SECRET env var.
// In development, the secret check is skipped so you can curl the endpoint
// directly while iterating.

import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { refreshXeroToken, type XeroTokenSet } from '~~/server/utils/xeroClient'
import { fullCustomerSync } from '~~/server/utils/xeroCustomerSync'

interface XeroOrgRow {
  tenant_id: string
  access_token: string
  refresh_token: string | null
  // BIGINT in Postgres — comes back as string from `pg`. Always coerce
  // to number before comparing with Date.now().
  expires_at: string | number | null
}

export default defineEventHandler(async (event) => {
  // Auth — same pattern as anomaly-detection cron.
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET
  if (!import.meta.dev && cronSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const full = query.full === 'true' || query.full === '1'

  // Skip the '__default__' placeholder row that's written on the OAuth
  // callback before the org picker resolves — it has a token but the
  // tenant_id isn't a real Xero org so every API call gets 403.
  // Match the same filter pattern used in tokenStore.getOrgTenant.
  const conn = await queryOne<XeroOrgRow>(
    `SELECT tenant_id, access_token, refresh_token, expires_at
       FROM xero_org_connection
       WHERE tenant_id != '__default__'
       ORDER BY updated_at DESC
       LIMIT 1`,
  )
  if (!conn) {
    return { ok: true, skipped: 'no Xero connection' }
  }

  // Refresh the token if it expires within the next 5 minutes — the cron
  // runs every 15 so we want a comfortable buffer.
  let accessToken = conn.access_token
  const expiresAtMs = conn.expires_at != null ? Number(conn.expires_at) : 0
  if (conn.refresh_token && expiresAtMs > 0 && expiresAtMs - Date.now() < 5 * 60 * 1000) {
    try {
      const refreshed: XeroTokenSet = await refreshXeroToken({
        refreshToken: conn.refresh_token,
      })
      accessToken = refreshed.access_token!
      // Persist the new token so the next run doesn't refresh again.
      // expires_at is BIGINT ms-epoch in this table — refreshXeroToken
      // already returns ms-epoch so pass it through directly.
      await execute(
        `UPDATE xero_org_connection SET
           access_token = $1,
           refresh_token = $2,
           expires_at = $3,
           updated_at = NOW()
         WHERE tenant_id = $4`,
        [
          refreshed.access_token,
          refreshed.refresh_token ?? conn.refresh_token,
          refreshed.expires_at ?? null,
          conn.tenant_id,
        ],
      )
    } catch (err: any) {
      // Don't bail — if refresh fails we still try the existing token;
      // worst case the Xero call returns 401 and the sync result records it.
      console.warn('[xero-customer-sync] token refresh failed:', err?.message)
    }
  }

  const result = await fullCustomerSync({
    tenantId: conn.tenant_id,
    accessToken,
    full,
  })

  return {
    ok: result.errors.length === 0,
    tenant: conn.tenant_id,
    mode: full ? 'full' : 'delta',
    ...result,
  }
})
