/**
 * ADME Advertising - EOM Sanity Checks & Validation
 *
 * Runs validation checks against a generated EOM run to flag
 * anomalies before pushing to Xero.
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { SANITY_CHECKS } from '~~/server/utils/invoicing/invoice-config'

export interface SanityCheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  expected: string
  actual: string
  message: string
}

export interface ValidationResult {
  checks: SanityCheckResult[]
  flaggedItems: number
}

export async function runSanityChecks(runId: string): Promise<ValidationResult> {
  const checks: SanityCheckResult[] = []

  // Get run totals
  const run = await queryOne<{
    total_ex_gst: number
    invoice_count: number
    line_item_count: number
    flagged_count: number
  }>(
    `SELECT total_ex_gst, invoice_count, line_item_count, flagged_count
     FROM eom_runs WHERE id = $1`,
    [runId],
  )

  if (!run) {
    return {
      checks: [{
        name: 'Run exists',
        status: 'fail',
        expected: 'Run record found',
        actual: 'Not found',
        message: 'EOM run not found in database',
      }],
      flaggedItems: 0,
    }
  }

  const totalExGst = Number(run.total_ex_gst) || 0
  const invoiceCount = Number(run.invoice_count) || 0
  const lineItemCount = Number(run.line_item_count) || 0

  // Check 1: Total against expected range
  const { min: minTotal, max: maxTotal } = SANITY_CHECKS.expectedMonthlyTotal
  checks.push({
    name: 'Monthly total (ex-GST)',
    status: totalExGst >= minTotal && totalExGst <= maxTotal ? 'pass'
      : totalExGst >= minTotal * 0.5 && totalExGst <= maxTotal * 1.5 ? 'warn'
      : 'fail',
    expected: `$${minTotal.toLocaleString()} - $${maxTotal.toLocaleString()}`,
    actual: `$${totalExGst.toLocaleString()}`,
    message: totalExGst >= minTotal && totalExGst <= maxTotal
      ? 'Monthly total is within expected range'
      : `Monthly total $${totalExGst.toLocaleString()} is outside expected range`,
  })

  // Check 2: Invoice count
  const { min: minInv, max: maxInv } = SANITY_CHECKS.expectedInvoiceCount
  checks.push({
    name: 'Invoice count',
    status: invoiceCount >= minInv && invoiceCount <= maxInv ? 'pass'
      : invoiceCount >= minInv * 0.5 && invoiceCount <= maxInv * 1.5 ? 'warn'
      : 'fail',
    expected: `${minInv} - ${maxInv}`,
    actual: String(invoiceCount),
    message: invoiceCount >= minInv && invoiceCount <= maxInv
      ? 'Invoice count is within expected range'
      : `${invoiceCount} invoices is outside expected range`,
  })

  // Check 3: Line item count
  const { min: minLines, max: maxLines } = SANITY_CHECKS.expectedLineItems
  checks.push({
    name: 'Line item count',
    status: lineItemCount >= minLines && lineItemCount <= maxLines ? 'pass'
      : lineItemCount >= minLines * 0.5 && lineItemCount <= maxLines * 1.5 ? 'warn'
      : 'fail',
    expected: `${minLines} - ${maxLines}`,
    actual: String(lineItemCount),
    message: lineItemCount >= minLines && lineItemCount <= maxLines
      ? 'Line item count is within expected range'
      : `${lineItemCount} line items is outside expected range`,
  })

  // Check 4: Flag single invoices over threshold
  const largeInvoices = await queryRows<{
    client_name: string
    total: number
  }>(
    `SELECT client_name, SUM(unit_amount * quantity) as total
     FROM eom_line_items WHERE run_id = $1
     GROUP BY client_name
     HAVING SUM(unit_amount * quantity) > $2`,
    [runId, SANITY_CHECKS.maxSingleInvoice],
  )

  checks.push({
    name: 'Large invoice check',
    status: largeInvoices.length === 0 ? 'pass' : 'warn',
    expected: `No invoice > $${SANITY_CHECKS.maxSingleInvoice.toLocaleString()}`,
    actual: largeInvoices.length === 0
      ? 'None found'
      : `${largeInvoices.length} invoice(s): ${largeInvoices.map(i => `${i.client_name} ($${Number(i.total).toLocaleString()})`).join(', ')}`,
    message: largeInvoices.length === 0
      ? 'No unusually large invoices detected'
      : `${largeInvoices.length} invoice(s) exceed $${SANITY_CHECKS.maxSingleInvoice.toLocaleString()} - review recommended`,
  })

  // Check 5: GST breakdown ratios
  const gstBreakdown = await queryRows<{ tax_type: string; cnt: number }>(
    `SELECT tax_type, COUNT(*) as cnt
     FROM eom_line_items WHERE run_id = $1
     GROUP BY tax_type`,
    [runId],
  )

  const gstCounts: Record<string, number> = {}
  for (const g of gstBreakdown) {
    gstCounts[g.tax_type] = Number(g.cnt)
  }
  const totalLines = lineItemCount || 1
  const gstOnIncomeRatio = (gstCounts['GST on Income'] || 0) / totalLines
  const gstFreeRatio = (gstCounts['GST Free Expenses'] || 0) / totalLines
  const gstOnExpensesRatio = (gstCounts['GST on Expenses'] || 0) / totalLines

  const expectedGst = SANITY_CHECKS.gstBreakdown
  const gstDeviation = Math.abs(gstOnIncomeRatio - expectedGst.gstOnIncome) +
    Math.abs(gstFreeRatio - expectedGst.gstFreeExpenses) +
    Math.abs(gstOnExpensesRatio - expectedGst.gstOnExpenses)

  checks.push({
    name: 'GST breakdown',
    status: gstDeviation < 0.2 ? 'pass' : gstDeviation < 0.4 ? 'warn' : 'fail',
    expected: `~${(expectedGst.gstOnIncome * 100).toFixed(0)}% Income / ~${(expectedGst.gstFreeExpenses * 100).toFixed(0)}% Free / ~${(expectedGst.gstOnExpenses * 100).toFixed(0)}% Expenses`,
    actual: `${(gstOnIncomeRatio * 100).toFixed(1)}% Income / ${(gstFreeRatio * 100).toFixed(1)}% Free / ${(gstOnExpensesRatio * 100).toFixed(1)}% Expenses`,
    message: gstDeviation < 0.2
      ? 'GST breakdown is within expected ratios'
      : 'GST breakdown deviates from expected ratios - review GST classifications',
  })

  // Check 6: Low-confidence items
  const lowConfidenceCount = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM eom_line_items
     WHERE run_id = $1 AND confidence = 'low'`,
    [runId],
  )
  const lowCount = Number(lowConfidenceCount?.cnt) || 0

  checks.push({
    name: 'Low-confidence items',
    status: lowCount === 0 ? 'pass' : lowCount <= 10 ? 'warn' : 'fail',
    expected: '0 low-confidence items',
    actual: `${lowCount} item(s)`,
    message: lowCount === 0
      ? 'All items mapped with medium or high confidence'
      : `${lowCount} item(s) have low confidence COA mapping - manual review required`,
  })

  // Check 7: Unmatched client names
  const unmatchedClients = await queryRows<{ client_name: string }>(
    `SELECT DISTINCT li.client_name
     FROM eom_line_items li
     LEFT JOIN agency_clients ac ON LOWER(li.client_name) = LOWER(ac.name)
     WHERE li.run_id = $1 AND ac.id IS NULL`,
    [runId],
  )

  checks.push({
    name: 'Unmatched client names',
    status: unmatchedClients.length === 0 ? 'pass'
      : unmatchedClients.length <= 5 ? 'warn' : 'fail',
    expected: 'All clients matched in agency_clients',
    actual: unmatchedClients.length === 0
      ? 'All matched'
      : `${unmatchedClients.length} unmatched: ${unmatchedClients.slice(0, 5).map(c => c.client_name).join(', ')}${unmatchedClients.length > 5 ? '...' : ''}`,
    message: unmatchedClients.length === 0
      ? 'All client names found in agency_clients table'
      : `${unmatchedClients.length} client name(s) not found in agency_clients - may cause Xero contact errors`,
  })

  return {
    checks,
    flaggedItems: Number(run.flagged_count) || 0,
  }
}
