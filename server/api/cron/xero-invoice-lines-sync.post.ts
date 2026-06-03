// server/api/cron/xero-invoice-lines-sync.post.ts
//
// Nightly refresh of the Xero invoice line-item cache (ACCREC + ACCPAY) that
// powers the AGI / "True Position" model on Get Out. Keeps the trailing window
// current (incl. month-end backdated entries) so the dashboard reads live data
// without a manual backfill.
//
// Configure a Cloudflare Cron Trigger pointing here with x-cron-secret:$CRON_SECRET
// (wired into workers/pages-cron). Default window = current + previous month;
// ?months=N or ?full=true widens it (full = 13 months).
//
// Auth + token handling mirror xero-customer-sync.post.ts: resolve the org from
// xero_org_connection, refresh the access token if near expiry, run the sync.

import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { refreshXeroToken, type XeroTokenSet } from '~~/server/utils/xeroClient'
import { syncInvoiceLines, syncAccounts } from '~~/server/utils/xeroInvoiceLinesSync'

interface XeroOrgRow {
  tenant_id: string
  access_token: string
  refresh_token: string | null
  expires_at: string | number | null
}

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const q = getQuery(event)
  const months = q.full === 'true' || q.full === '1'
    ? 13
    : Math.min(13, Math.max(1, Number(q.months) || 2))

  const conn = await queryOne<XeroOrgRow>(
    `SELECT tenant_id, access_token, refresh_token, expires_at
       FROM xero_org_connection
      WHERE tenant_id != '__default__'
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
  if (!conn) return { ok: true, skipped: 'no Xero connection' }

  let accessToken = conn.access_token
  const expiresAtMs = conn.expires_at != null ? Number(conn.expires_at) : 0
  if (conn.refresh_token && expiresAtMs > 0 && expiresAtMs - Date.now() < 5 * 60 * 1000) {
    try {
      const refreshed: XeroTokenSet = await refreshXeroToken({ refreshToken: conn.refresh_token })
      accessToken = refreshed.access_token!
      await execute(
        `UPDATE xero_org_connection SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
          WHERE tenant_id = $4`,
        [refreshed.access_token, refreshed.refresh_token ?? conn.refresh_token, refreshed.expires_at ?? null, conn.tenant_id],
      )
    } catch (err: any) {
      console.warn('[xero-invoice-lines-sync] token refresh failed:', err?.message)
    }
  }

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)

  const result = await syncInvoiceLines({ accessToken, tenantId: conn.tenant_id, fromDate })
  let accounts = 0
  try {
    accounts = await syncAccounts({ accessToken, tenantId: conn.tenant_id })
  } catch (err: any) {
    console.warn('[xero-invoice-lines-sync] accounts sync failed:', err?.message)
  }

  return { ok: true, tenant: conn.tenant_id, months, accounts, ...result }
})
