/**
 * GET /api/xero/get-out/tax-provision
 *
 * Australian agency tax provisioning estimate. Surfaces the cash you should
 * be setting aside for the next BAS / quarterly obligations so the operator
 * doesn't get blindsided when ATO comes knocking.
 *
 * Computes (rough estimates — operator should sanity-check against accountant):
 *   gstCollected       — sum of (invoiced × 1/11) for ACCREC this quarter
 *   gstPaid            — sum of (expensed × 1/11) for ACCPAY this quarter
 *   gstNetOwed         — gstCollected − gstPaid (positive = owe ATO)
 *   payg               — wages × ~0.225 (rough top-of-bracket withholding)
 *   superGuarantee     — wages × 0.115 (statutory rate, FY26)
 *   totalSetAside      — gstNetOwed + payg + superGuarantee
 *   currentQuarter     — { Q, year, fromDate, toDate }
 *   bas                — { dueDate, daysUntil }
 *
 * Notes:
 *   • GST math assumes invoices INCLUDE GST at 10% (the default for Aus
 *     agencies). Tenants on cash-basis GST will need a different calc;
 *     not modeled here.
 *   • PAYG withholding is a heuristic — actual withholding depends on each
 *     employee's tax bracket, HECS, etc. Use as a "set aside this much"
 *     anchor, not a final number.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { loadGetOutConfig } from '~~/server/utils/getOutConfig'

interface InvoicedRow {
  ar_cents: string | number
  ap_cents: string | number
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

const PAYG_HEURISTIC = 0.225
const SUPER_GUARANTEE_RATE = 0.115

/**
 * Australian financial-quarter date range for the given Date.
 * Q1: Jul-Sep, Q2: Oct-Dec, Q3: Jan-Mar, Q4: Apr-Jun
 * BAS due dates are the 28th of the second month after quarter close.
 */
function australianQuarter(d: Date) {
  const m = d.getMonth() // 0-11
  const y = d.getFullYear()
  // Map calendar month → AU FY quarter index 0-3 + start month + due offset
  const quarterMap = [
    { q: 3, startY: y - (m < 6 ? 1 : 0), startM: 3 }, // Jan = Q3 (Jan-Mar). Calendar year, FY starts prior Jul.
    { q: 3, startY: y - (m < 6 ? 1 : 0), startM: 3 },
    { q: 3, startY: y - (m < 6 ? 1 : 0), startM: 3 },
    { q: 4, startY: y - (m < 6 ? 1 : 0), startM: 6 }, // Apr = Q4 (Apr-Jun)
    { q: 4, startY: y - (m < 6 ? 1 : 0), startM: 6 },
    { q: 4, startY: y - (m < 6 ? 1 : 0), startM: 6 },
    { q: 1, startY: y, startM: 9 }, // Jul = Q1 (Jul-Sep)
    { q: 1, startY: y, startM: 9 },
    { q: 1, startY: y, startM: 9 },
    { q: 2, startY: y, startM: 0 }, // Oct = Q2 (Oct-Dec)
    { q: 2, startY: y, startM: 0 },
    { q: 2, startY: y, startM: 0 },
  ]
  const meta = quarterMap[m]!
  // Q labels are calendar-quarter for clarity (Q1 2026 = Jan-Mar 2026)
  const qLabel = Math.floor(m / 3) + 1
  const quarterStartMonth = qLabel === 1 ? 0 : qLabel === 2 ? 3 : qLabel === 3 ? 6 : 9
  const quarterStart = new Date(y, quarterStartMonth, 1)
  const quarterEnd = new Date(y, quarterStartMonth + 3, 0)
  // BAS due ≈ 28th of the month after quarter close (28 May for Mar quarter, etc.)
  const basDue = new Date(quarterEnd.getFullYear(), quarterEnd.getMonth() + 2, 28)
  void meta // silence unused
  return { qLabel, year: y, quarterStart, quarterEnd, basDue }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const today = new Date()
  const { qLabel, year, quarterStart, quarterEnd, basDue } = australianQuarter(today)
  const qStartStr = quarterStart.toISOString().slice(0, 10)
  const qEndStr = quarterEnd.toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)
  // Cap end of window at today so we don't double-count future invoicing.
  const queryEnd = qEndStr < todayStr ? qEndStr : todayStr

  // ACCREC + ACCPAY totals for the quarter so far (cash-out + cash-in basis).
  const row = await queryOne<InvoicedRow>(
    `SELECT
       COALESCE(SUM(CASE WHEN type='ACCREC' AND status NOT IN ('VOIDED','DRAFT','DELETED')
                          AND date BETWEEN $2::date AND $3::date
                         THEN total_cents ELSE 0 END), 0)::text AS ar_cents,
       COALESCE(SUM(CASE WHEN type='ACCPAY' AND status NOT IN ('VOIDED','DRAFT','DELETED')
                          AND date BETWEEN $2::date AND $3::date
                         THEN total_cents ELSE 0 END), 0)::text AS ap_cents
       FROM xero_invoices_cache
       WHERE tenant_id = $1`,
    [tenantId, qStartStr, queryEnd],
  )
  const arInclGst = n(row?.ar_cents) / 100
  const apInclGst = n(row?.ap_cents) / 100

  // GST of total-incl-GST = total / 11 (1/11 of an inclusive amount).
  const gstCollected = arInclGst / 11
  const gstPaid = apInclGst / 11
  const gstNetOwed = Math.max(0, gstCollected - gstPaid)

  // Wages this quarter from getOutConfig (monthly × months in quarter so far).
  const cfg = await loadGetOutConfig(tenantId)
  const wagesLine = cfg.lines.filter(l => l.category === 'wages').reduce((s, l) => s + l.amountCents, 0)
  const monthlyWages = wagesLine / 100
  const monthsInQuarterSoFar = (today.getMonth() - quarterStart.getMonth() + 1)
  const wagesQuarter = monthlyWages * Math.max(1, monthsInQuarterSoFar)
  const payg = wagesQuarter * PAYG_HEURISTIC
  const superGuarantee = wagesQuarter * SUPER_GUARANTEE_RATE
  const totalSetAside = gstNetOwed + payg + superGuarantee

  const daysUntilBas = Math.ceil((basDue.getTime() - today.getTime()) / 86_400_000)

  return {
    currentQuarter: {
      label: `Q${qLabel} ${year}`,
      fromDate: qStartStr,
      toDate: qEndStr,
      monthsElapsed: monthsInQuarterSoFar,
    },
    bas: {
      dueDate: basDue.toISOString().slice(0, 10),
      daysUntil: daysUntilBas,
    },
    gst: {
      collected: Math.round(gstCollected * 100) / 100,
      paid:      Math.round(gstPaid * 100) / 100,
      netOwed:   Math.round(gstNetOwed * 100) / 100,
      arInclGst: Math.round(arInclGst * 100) / 100,
      apInclGst: Math.round(apInclGst * 100) / 100,
    },
    payg: {
      estimated: Math.round(payg * 100) / 100,
      basedOnWagesQuarter: Math.round(wagesQuarter * 100) / 100,
      ratePct: PAYG_HEURISTIC * 100,
    },
    superGuarantee: {
      estimated: Math.round(superGuarantee * 100) / 100,
      ratePct: SUPER_GUARANTEE_RATE * 100,
    },
    totalSetAside: Math.round(totalSetAside * 100) / 100,
    methodology: 'GST 1/11 of inclusive amounts. PAYG estimate = wages × 22.5%. Super = wages × 11.5% (FY26 SG rate). Sanity-check with your accountant before lodging.',
  }
})
