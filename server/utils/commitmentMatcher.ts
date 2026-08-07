/**
 * Matching engine: links forecast-only commitments to real Xero bills.
 *
 * Precedence rule from the cash forecasting model: a real accounting
 * document always supersedes an estimate. When a bill lands in Xero that
 * corresponds to an open commitment, the commitment is marked 'matched'
 * (with matched_invoice_id) and stops contributing to the forecast —
 * never double-counted, never deleted.
 *
 * Confidence tiers:
 *  - auto: same Xero contact (or exact supplier-name match), amount within
 *    1%, due date within 30 days of expected. Safe to apply unattended.
 *  - suggested: name similarity + amount within 10% + date within 45 days.
 *    Requires human confirmation — money decisions are not guessed at.
 */

import { queryRows, execute } from './db'

export interface MatchCandidate {
  commitmentId: string
  supplier: string
  amountCents: number
  expectedDate: string
  invoiceId: string
  invoiceNumber: string | null
  contactName: string
  invoiceAmountCents: number
  invoiceDueDate: string
  confidence: 'auto' | 'suggested'
}

interface CommitmentRow {
  id: string
  supplier: string
  contact_id: string | null
  amount_cents: string
  expected_date: string
}

interface BillRow {
  invoice_id: string
  invoice_number: string | null
  contact_id: string
  contact_name: string
  total_cents: string
  due_date: string
}

const DAY_MS = 86_400_000

function normName(s: string): string {
  return s.toLowerCase().replace(/\b(pty|ltd|pl|the|co|inc)\b/g, '').replace(/[^a-z0-9]/g, '')
}

function daysApart(a: string, b: string): number {
  return Math.abs(new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / DAY_MS
}

export async function findCommitmentMatches(tenantId: string): Promise<MatchCandidate[]> {
  const commitments = await queryRows<CommitmentRow>(
    `SELECT id, supplier, contact_id, amount_cents::text AS amount_cents,
            TO_CHAR(expected_date, 'YYYY-MM-DD') AS expected_date
     FROM cashflow_commitments
     WHERE tenant_id = $1 AND status IN ('expected', 'hold') AND matched_invoice_id IS NULL`,
    [tenantId],
  )
  if (!commitments.length) return []

  // Candidate bills: unpaid or recently-entered ACCPAY documents around the
  // commitments' date range. DRAFT counts — a draft bill is already a real
  // document that supersedes an estimate.
  const bills = await queryRows<BillRow>(
    `SELECT i.invoice_id, i.invoice_number, i.contact_id, c.name AS contact_name,
            i.total_cents::text AS total_cents,
            TO_CHAR(i.due_date, 'YYYY-MM-DD') AS due_date
     FROM xero_invoices_cache i
     JOIN xero_contacts_cache c USING (tenant_id, contact_id)
     WHERE i.tenant_id = $1 AND i.type = 'ACCPAY'
       AND i.status IN ('DRAFT', 'AUTHORISED', 'PAID')
       AND i.due_date >= NOW() - INTERVAL '90 days'`,
    [tenantId],
  )

  // Bills already claimed by another commitment must not match twice.
  const claimed = new Set(
    (await queryRows<{ matched_invoice_id: string }>(
      `SELECT matched_invoice_id FROM cashflow_commitments
       WHERE tenant_id = $1 AND matched_invoice_id IS NOT NULL`,
      [tenantId],
    )).map(r => r.matched_invoice_id),
  )

  const results: MatchCandidate[] = []
  const takenInThisRun = new Set<string>()

  for (const cm of commitments) {
    const cmAmount = Number(cm.amount_cents)
    const cmName = normName(cm.supplier)
    let best: { bill: BillRow; confidence: 'auto' | 'suggested'; score: number } | null = null

    for (const bill of bills) {
      if (claimed.has(bill.invoice_id) || takenInThisRun.has(bill.invoice_id)) continue
      const billAmount = Number(bill.total_cents)
      if (!billAmount) continue

      const contactHit = cm.contact_id ? cm.contact_id === bill.contact_id : false
      const billName = normName(bill.contact_name)
      const nameHit = contactHit
        || cmName === billName
        || (cmName.length >= 4 && (billName.includes(cmName) || cmName.includes(billName)))
      if (!nameHit) continue

      const amountRatio = Math.abs(billAmount - cmAmount) / cmAmount
      const dateGap = daysApart(cm.expected_date, bill.due_date)

      let confidence: 'auto' | 'suggested' | null = null
      if ((contactHit || cmName === billName) && amountRatio <= 0.01 && dateGap <= 30) confidence = 'auto'
      else if (amountRatio <= 0.10 && dateGap <= 45) confidence = 'suggested'
      if (!confidence) continue

      const score = amountRatio + dateGap / 100 + (contactHit ? 0 : 0.05)
      if (!best || score < best.score) best = { bill, confidence, score }
    }

    if (best) {
      takenInThisRun.add(best.bill.invoice_id)
      results.push({
        commitmentId: cm.id,
        supplier: cm.supplier,
        amountCents: cmAmount,
        expectedDate: cm.expected_date,
        invoiceId: best.bill.invoice_id,
        invoiceNumber: best.bill.invoice_number,
        contactName: best.bill.contact_name,
        invoiceAmountCents: Number(best.bill.total_cents),
        invoiceDueDate: best.bill.due_date,
        confidence: best.confidence,
      })
    }
  }
  return results
}

/** Marks the given commitment as superseded by a real Xero bill. */
export async function applyMatch(tenantId: string, commitmentId: string, invoiceId: string): Promise<void> {
  await execute(
    `UPDATE cashflow_commitments
     SET matched_invoice_id = $3, status = 'matched', updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, commitmentId, invoiceId],
  )
}
