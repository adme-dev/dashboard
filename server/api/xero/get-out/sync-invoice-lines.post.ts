/**
 * POST /api/xero/get-out/sync-invoice-lines
 *
 * Backfill / refresh the line-item cache (ACCREC + ACCPAY) for a window.
 * Body: { months?: number } OR { from: 'YYYY-MM', to?: 'YYYY-MM' } and
 * optional { types: ['ACCREC','ACCPAY'] }.
 *
 * Reads from Xero, writes xero_invoice_lines_cache. Window support lets us
 * backfill month-by-month so a large sweep doesn't hit Worker time limits.
 */

import { defineEventHandler, createError, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { syncInvoiceLines, syncAccounts } from '~~/server/utils/xeroInvoiceLinesSync'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })

  const body = (await readBody(event).catch(() => ({}))) as any

  const types: Array<'ACCREC' | 'ACCPAY'> =
    Array.isArray(body?.types) && body.types.length
      ? body.types.filter((t: any) => t === 'ACCREC' || t === 'ACCPAY')
      : ['ACCREC', 'ACCPAY']

  let fromDate: Date
  let toDate: Date | undefined

  const mFrom = typeof body?.from === 'string' && /^\d{4}-\d{2}$/.test(body.from) ? body.from : null
  if (mFrom) {
    const [fy, fm] = mFrom.split('-').map(Number)
    fromDate = new Date(fy!, fm! - 1, 1)
    const mTo = typeof body?.to === 'string' && /^\d{4}-\d{2}$/.test(body.to) ? body.to : null
    if (mTo) {
      const [ty, tm] = mTo.split('-').map(Number)
      toDate = new Date(ty!, tm!, 1) // exclusive end = first day after the `to` month
    } else {
      toDate = new Date(fy!, fm!, 1) // single month
    }
  } else {
    const months = Math.min(36, Math.max(1, Number(body?.months) || 13))
    const now = new Date()
    fromDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    toDate = undefined
  }

  const result = await syncInvoiceLines({
    accessToken: token.access_token!,
    tenantId,
    fromDate,
    toDate,
    types,
  })

  // Refresh the chart-of-accounts cache (best-effort; needed for type-driven
  // direct-cost / overhead classification).
  let accounts = 0
  try {
    accounts = await syncAccounts({ accessToken: token.access_token!, tenantId })
  } catch (err: any) {
    console.warn('[sync-invoice-lines] accounts sync failed:', err?.message)
  }

  return {
    ok: true,
    accounts,
    window: {
      from: fromDate.toISOString().slice(0, 10),
      to: toDate ? toDate.toISOString().slice(0, 10) : 'now',
    },
    types,
    ...result,
  }
})
