/**
 * ADME Advertising - EOM Invoice Generation Engine
 *
 * Core engine for end-of-month invoice generation.
 * Pulls data from Monday.com jobs board and cached PPC spend,
 * maps to Xero COA codes, classifies GST, and generates line items.
 */

import type { H3Event } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { MondayClient } from '~~/server/utils/mondayClient'
import { createXeroClient } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { mapToAccountWithConfidence } from '~~/server/utils/invoicing/coa-map'
import { classifyGST } from '~~/server/utils/invoicing/gst-rules'
import { matchClient, fetchLocalClients } from '~~/server/utils/invoicing/xero-clients'
import {
  createNumberingSequence,
  calculateBillAmount,
  MONDAY_CONFIG,
} from '~~/server/utils/invoicing/invoice-config'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EomGenerationResult {
  id: string
  month: number
  year: number
  status: string
  total_ex_gst: number | null
  total_gst: number | null
  invoice_count: number
  line_item_count: number
  flagged_count: number
  first_invoice_number: number | null
  last_invoice_number: number | null
  created_at: string
}

interface MondayJobItem {
  itemId: string
  name: string
  clientName: string
  amount: number
  description: string
  trackingCategory: string | null
}

// ── Main Generation Function ──────────────────────────────────────────────────

export async function generateEomInvoices(
  userId: string,
  month: number,
  year: number,
  event?: H3Event,
): Promise<EomGenerationResult> {
  const run = await queryOne<{ id: string }>(
    `INSERT INTO eom_runs (month, year, status, created_by)
     VALUES ($1, $2, 'generating', $3) RETURNING id`,
    [month, year, userId],
  )
  if (!run) throw new Error('Failed to create EOM run record')
  const runId = run.id

  try {
    const lastInvoiceNumber = await getLastInvoiceNumber(event)
    const numbering = createNumberingSequence(lastInvoiceNumber)
    const localClients = await fetchLocalClients()

    await pullMondayJobs(runId, localClients)
    await pullMetaSpend(runId, month, year)
    await pullGoogleSpend(runId, month, year)
    await assignInvoiceNumbers(runId, numbering.currentNumber)
    await updateRunTotals(runId)

    const result = await queryOne<EomGenerationResult>(
      `SELECT id, month, year, status, total_ex_gst, total_gst,
              invoice_count, line_item_count, flagged_count,
              first_invoice_number, last_invoice_number, created_at
       FROM eom_runs WHERE id = $1`,
      [runId],
    )
    return result!
  } catch (err: any) {
    await execute(
      `UPDATE eom_runs SET status = 'failed', notes = $2, updated_at = NOW()
       WHERE id = $1`,
      [runId, `Generation failed: ${err.message}`],
    )
    throw err
  }
}

// ── Get Last Invoice Number ───────────────────────────────────────────────────

async function getLastInvoiceNumber(event?: H3Event): Promise<number> {
  // Try Xero first
  if (event) {
    try {
      const token = await getActiveTokenForSession(event)
      const tenantId = await getSelectedTenant(event)
      if (tenantId) {
        const client = await createXeroClient({ tokenSet: token, event })
        const response = await (client.accountingApi as any).getInvoices(
          tenantId, undefined, 'Type=="ACCREC"', 'InvoiceNumber DESC',
          undefined, undefined, undefined, undefined, 1, false,
          undefined, undefined, undefined, 1,
        )
        const invoices = response?.body?.invoices || []
        if (invoices.length > 0 && invoices[0].invoiceNumber) {
          const num = parseInt(invoices[0].invoiceNumber, 10)
          if (!isNaN(num)) return num
        }
      }
    } catch (err: any) {
      console.warn('[EOM] Xero lookup failed, falling back to DB:', err.message)
    }
  }

  // Fallback: query DB for last used invoice number
  const row = await queryOne<{ max_num: number | null }>(
    `SELECT MAX(last_invoice_number) as max_num
     FROM eom_runs WHERE last_invoice_number IS NOT NULL`,
  )
  return row?.max_num || 18400
}

// ── Pull Monday.com Jobs ──────────────────────────────────────────────────────

async function pullMondayJobs(
  runId: string,
  localClients: Array<{ name: string; code: string; contactId: string }>,
): Promise<void> {
  const config = useRuntimeConfig()
  if (!config.mondayApiToken) {
    console.warn('[EOM] Monday API token not configured, skipping Monday jobs')
    return
  }

  const monday = new MondayClient(config.mondayApiToken)
  const items: MondayJobItem[] = []

  try {
    let cursor: string | undefined
    let hasMore = true
    while (hasMore) {
      const result = await monday.getItems(MONDAY_CONFIG.jobsBoardId, {
        limit: 100,
        cursor,
      })
      for (const item of result.items) {
        const parsed = parseMondayItem(item)
        if (parsed && isBillableStatus(item)) {
          items.push(parsed)
        }
      }
      cursor = result.cursor
      hasMore = !!cursor
    }
  } catch (err: any) {
    console.error('[EOM] Failed to fetch Monday.com items:', err.message)
    return
  }

  // Process each Monday job into line items
  for (const job of items) {
    try {
      const mapping = mapToAccountWithConfidence(job.description || job.name)
      const gst = classifyGST(job.description || job.name, mapping.code)
      const clientMatch = matchClient(job.clientName, localClients)
      const billAmount = calculateBillAmount(job.amount, mapping.code)

      await execute(
        `INSERT INTO eom_line_items
         (run_id, client_name, client_code, monday_item_id, description,
          quantity, unit_amount, account_code, tax_type, tracking_option1,
          source, confidence, matched_keyword, review_status, original_values)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          runId,
          clientMatch?.contact.name || job.clientName,
          clientMatch?.contact.code || null,
          job.itemId,
          job.description || job.name,
          1,
          billAmount,
          mapping.code,
          gst.taxType,
          job.trackingCategory || mapping.tracking,
          'monday',
          mapping.confidence,
          mapping.matchedKeyword || null,
          mapping.confidence === 'low' ? 'flagged' : 'auto',
          clientMatch && !clientMatch.exact
            ? JSON.stringify({
                originalClientName: job.clientName,
                matchScore: clientMatch.score,
              })
            : null,
        ],
      )
    } catch (err: any) {
      console.error(`[EOM] Failed to process Monday item ${job.itemId}:`, err.message)
    }
  }
}

// ── Monday Item Parsing ───────────────────────────────────────────────────────

function parseMondayItem(item: any): MondayJobItem | null {
  const cv = item.column_values || []
  const clientName = findColumnValue(cv, MONDAY_CONFIG.expectedColumns.client)
  const amountStr = findColumnValue(cv, MONDAY_CONFIG.expectedColumns.amount)
  const description =
    findColumnValue(cv, MONDAY_CONFIG.expectedColumns.description) || item.name
  const tracking = findColumnValue(cv, MONDAY_CONFIG.expectedColumns.tracking)
  const amount = parseFloat(amountStr || '0')
  if (!clientName || amount <= 0) return null
  return {
    itemId: item.id,
    name: item.name,
    clientName,
    amount,
    description: description || item.name,
    trackingCategory: tracking || null,
  }
}

function findColumnValue(
  columnValues: any[],
  expectedIds: string[],
): string | null {
  for (const cv of columnValues) {
    const colId = (cv.id || '').toLowerCase()
    const colTitle = (cv.title || '').toLowerCase()
    if (
      expectedIds.some(
        (e) => colId.includes(e) || colTitle?.includes(e),
      )
    ) {
      if (cv.text) return cv.text
      if (cv.value) {
        try {
          const p = JSON.parse(cv.value)
          if (typeof p === 'string') return p
          if (p?.text) return p.text
          if (p?.label) return p.label
          if (p?.value != null) return String(p.value)
          if (p?.name) return p.name
        } catch {
          return cv.value
        }
      }
    }
  }
  return null
}

function isBillableStatus(item: any): boolean {
  const sc = (item.column_values || []).find((cv: any) =>
    MONDAY_CONFIG.expectedColumns.status.some((s) =>
      (cv.id || '').toLowerCase().includes(s),
    ),
  )
  if (!sc) return true
  const text = sc.text || ''
  if (!text && sc.value) {
    try {
      const p = JSON.parse(sc.value)
      return MONDAY_CONFIG.billableStatuses.some(
        (s) => (p?.label || p?.text || '').toLowerCase() === s.toLowerCase(),
      )
    } catch {
      return false
    }
  }
  return MONDAY_CONFIG.billableStatuses.some(
    (s) => text.toLowerCase() === s.toLowerCase(),
  )
}

// ── Pull Meta Spend ───────────────────────────────────────────────────────────

async function pullMetaSpend(
  runId: string,
  month: number,
  year: number,
): Promise<void> {
  const period = `${year}-${String(month).padStart(2, '0')}`
  const rows = await queryRows<{
    actual_spend: number
    campaign_name: string | null
    client_name: string | null
    client_code: string | null
  }>(
    `SELECT ms.actual_spend, ms.campaign_name,
            ac.name as client_name, ac.code as client_code
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ms.client_id = ac.id
     WHERE ms.platform = 'meta' AND ms.period = $1
       AND ms.actual_spend > 0`,
    [period],
  )

  for (const row of rows) {
    if (!row.client_name) continue
    const desc = row.campaign_name
      ? `Facebook & Instagram PPC - ${row.campaign_name}`
      : 'Facebook & Instagram PPC Payable to Meta'
    await execute(
      `INSERT INTO eom_line_items
       (run_id, client_name, client_code, description, quantity, unit_amount,
        account_code, tax_type, tracking_option1, source, confidence,
        matched_keyword, review_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        runId, row.client_name, row.client_code, desc, 1, row.actual_spend,
        '330', 'GST Free Expenses', 'Facebook Ads', 'meta_ads', 'high',
        'payable to meta', 'auto',
      ],
    )
  }
}

// ── Pull Google Spend ─────────────────────────────────────────────────────────

async function pullGoogleSpend(
  runId: string,
  month: number,
  year: number,
): Promise<void> {
  const period = `${year}-${String(month).padStart(2, '0')}`
  const rows = await queryRows<{
    actual_spend: number
    campaign_name: string | null
    client_name: string | null
    client_code: string | null
  }>(
    `SELECT ms.actual_spend, ms.campaign_name,
            ac.name as client_name, ac.code as client_code
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ms.client_id = ac.id
     WHERE ms.platform = 'google_ads' AND ms.period = $1
       AND ms.actual_spend > 0`,
    [period],
  )

  for (const row of rows) {
    if (!row.client_name) continue
    const desc = row.campaign_name
      ? `Google Ads PPC - ${row.campaign_name}`
      : 'Google Ads PPC Payable to Google'
    await execute(
      `INSERT INTO eom_line_items
       (run_id, client_name, client_code, description, quantity, unit_amount,
        account_code, tax_type, tracking_option1, source, confidence,
        matched_keyword, review_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        runId, row.client_name, row.client_code, desc, 1, row.actual_spend,
        '330', 'GST on Expenses', 'Google Ads', 'google_ads', 'high',
        'payable to google', 'auto',
      ],
    )
  }
}

// ── Assign Invoice Numbers ────────────────────────────────────────────────────

async function assignInvoiceNumbers(
  runId: string,
  startNumber: number,
): Promise<void> {
  const clients = await queryRows<{ client_name: string }>(
    `SELECT DISTINCT client_name FROM eom_line_items
     WHERE run_id = $1 ORDER BY client_name`,
    [runId],
  )
  let num = startNumber
  for (const c of clients) {
    await execute(
      `UPDATE eom_line_items SET invoice_number = $1
       WHERE run_id = $2 AND client_name = $3`,
      [num, runId, c.client_name],
    )
    num++
  }
}

// ── Update Run Totals ─────────────────────────────────────────────────────────

async function updateRunTotals(runId: string): Promise<void> {
  await execute(
    `UPDATE eom_runs SET
       status = 'review',
       total_ex_gst = (
         SELECT COALESCE(SUM(unit_amount * quantity), 0)
         FROM eom_line_items WHERE run_id = $1
       ),
       total_gst = (
         SELECT COALESCE(SUM(
           CASE WHEN tax_type IN ('GST on Income','GST on Expenses')
                THEN unit_amount * quantity * 0.10 ELSE 0 END
         ), 0)
         FROM eom_line_items WHERE run_id = $1
       ),
       invoice_count = (
         SELECT COUNT(DISTINCT invoice_number)
         FROM eom_line_items WHERE run_id = $1 AND invoice_number IS NOT NULL
       ),
       line_item_count = (
         SELECT COUNT(*) FROM eom_line_items WHERE run_id = $1
       ),
       flagged_count = (
         SELECT COUNT(*) FROM eom_line_items
         WHERE run_id = $1 AND (confidence = 'low' OR review_status = 'flagged')
       ),
       first_invoice_number = (
         SELECT MIN(invoice_number)
         FROM eom_line_items WHERE run_id = $1 AND invoice_number IS NOT NULL
       ),
       last_invoice_number = (
         SELECT MAX(invoice_number)
         FROM eom_line_items WHERE run_id = $1 AND invoice_number IS NOT NULL
       ),
       updated_at = NOW()
     WHERE id = $1`,
    [runId],
  )
}

// ── Regeneration ──────────────────────────────────────────────────────────────

export async function regenerateEomRun(
  runId: string,
  userId: string,
  event?: H3Event,
): Promise<EomGenerationResult> {
  const existing = await queryOne<{
    month: number
    year: number
    status: string
  }>(
    `SELECT month, year, status FROM eom_runs WHERE id = $1`,
    [runId],
  )
  if (!existing) throw new Error('EOM run not found')
  if (existing.status === 'pushed' || existing.status === 'complete') {
    throw new Error('Cannot regenerate a pushed/complete run')
  }

  await execute(`DELETE FROM eom_line_items WHERE run_id = $1`, [runId])
  await execute(
    `UPDATE eom_runs SET status = 'generating', notes = NULL,
     updated_at = NOW() WHERE id = $1`,
    [runId],
  )

  try {
    const numbering = createNumberingSequence(
      await getLastInvoiceNumber(event),
    )
    const localClients = await fetchLocalClients()
    await pullMondayJobs(runId, localClients)
    await pullMetaSpend(runId, existing.month, existing.year)
    await pullGoogleSpend(runId, existing.month, existing.year)
    await assignInvoiceNumbers(runId, numbering.currentNumber)
    await updateRunTotals(runId)
    const result = await queryOne<EomGenerationResult>(
      `SELECT id, month, year, status, total_ex_gst, total_gst,
              invoice_count, line_item_count, flagged_count,
              first_invoice_number, last_invoice_number, created_at
       FROM eom_runs WHERE id = $1`,
      [runId],
    )
    return result!
  } catch (err: any) {
    await execute(
      `UPDATE eom_runs SET status = 'failed', notes = $2,
       updated_at = NOW() WHERE id = $1`,
      [runId, `Regeneration failed: ${err.message}`],
    )
    throw err
  }
}
