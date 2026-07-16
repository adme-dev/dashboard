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
import { resolveCronXeroAuth } from '~~/server/utils/xeroCronAuth'
import { syncInvoiceLines, syncAccounts } from '~~/server/utils/xeroInvoiceLinesSync'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const q = getQuery(event)
  const months = q.full === 'true' || q.full === '1'
    ? 13
    : Math.min(13, Math.max(1, Number(q.months) || 2))

  const auth = await resolveCronXeroAuth('xero-invoice-lines-sync')
  if (!auth) return { ok: true, skipped: 'no Xero connection' }
  const { tenantId, accessToken } = auth

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)

  const result = await syncInvoiceLines({ accessToken, tenantId, fromDate })
  let accounts = 0
  try {
    accounts = await syncAccounts({ accessToken, tenantId })
  } catch (err: any) {
    console.warn('[xero-invoice-lines-sync] accounts sync failed:', err?.message)
  }

  return { ok: true, tenant: tenantId, months, accounts, ...result }
})
