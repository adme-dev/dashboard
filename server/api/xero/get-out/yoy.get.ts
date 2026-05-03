/**
 * GET /api/xero/get-out/yoy
 *
 * Same-month-last-year comparison. Most credible comparator since it
 * controls for seasonal patterns that month-on-month doesn't.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface MonthRow { invoiced_cents: string | number; invoice_count: number }

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const today = new Date()
  const thisStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const thisEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)
  const lastStart = new Date(today.getFullYear() - 1, today.getMonth(), 1).toISOString().slice(0, 10)
  // Only count last year's invoicing up to the same day-of-month so the
  // comparison is apples-to-apples mid-month.
  const lastSameDay = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10)
  const lastFullEnd = new Date(today.getFullYear() - 1, today.getMonth() + 1, 0).toISOString().slice(0, 10)

  const sql = `
    SELECT COALESCE(SUM(total_cents), 0)::text AS invoiced_cents,
           COUNT(*)::int AS invoice_count
      FROM xero_invoices_cache
      WHERE tenant_id = $1
        AND type = 'ACCREC'
        AND status NOT IN ('VOIDED','DRAFT','DELETED')
        AND date BETWEEN $2::date AND $3::date
  `
  // Earliest cached ACCREC invoice — lets the UI distinguish "we genuinely
  // had $0 last May" from "we didn't have a Xero connection last May yet".
  const earliestRowPromise = queryOne<{ earliest: string | null }>(
    `SELECT MIN(date)::text AS earliest
       FROM xero_invoices_cache
       WHERE tenant_id = $1 AND type = 'ACCREC'`,
    [tenantId],
  )
  const [thisMonth, lastMonthSameDay, lastMonthFull, earliestRow] = await Promise.all([
    queryOne<MonthRow>(sql, [tenantId, thisStart, thisEnd]),
    queryOne<MonthRow>(sql, [tenantId, lastStart, lastSameDay]),
    queryOne<MonthRow>(sql, [tenantId, lastStart, lastFullEnd]),
    earliestRowPromise,
  ])

  // "Sufficient history" means the start of last year's comparison window
  // is on or after the earliest invoice we have cached for this tenant.
  // Otherwise the comparison is meaningless and the UI should say so.
  const dataAvailableSince = earliestRow?.earliest ?? null
  const historicalDataSufficient = !!(dataAvailableSince && dataAvailableSince <= lastStart)

  const thisInvoiced = Number(thisMonth?.invoiced_cents ?? 0) / 100
  const lastSameDayInvoiced = Number(lastMonthSameDay?.invoiced_cents ?? 0) / 100
  const lastFullInvoiced = Number(lastMonthFull?.invoiced_cents ?? 0) / 100
  const sameDayDelta = lastSameDayInvoiced > 0
    ? Math.round(((thisInvoiced - lastSameDayInvoiced) / lastSameDayInvoiced) * 1000) / 10
    : null
  const fullMonthDelta = lastFullInvoiced > 0
    ? Math.round(((thisInvoiced - lastFullInvoiced) / lastFullInvoiced) * 1000) / 10
    : null

  return {
    thisYear: {
      monthStart: thisStart,
      invoiced: Math.round(thisInvoiced * 100) / 100,
      invoiceCount: Number(thisMonth?.invoice_count ?? 0),
    },
    lastYearSameDay: {
      monthStart: lastStart,
      throughDate: lastSameDay,
      invoiced: Math.round(lastSameDayInvoiced * 100) / 100,
      invoiceCount: Number(lastMonthSameDay?.invoice_count ?? 0),
    },
    lastYearFull: {
      monthStart: lastStart,
      monthEnd: lastFullEnd,
      invoiced: Math.round(lastFullInvoiced * 100) / 100,
    },
    deltaPct: { sameDay: sameDayDelta, fullMonth: fullMonthDelta },
    dataAvailableSince,
    historicalDataSufficient,
  }
})
