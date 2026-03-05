/**
 * Shared Xero data access layer.
 *
 * Provides canonical fetch functions for common Xero data (bank summary,
 * receivables, payables, etc.) with dedup keys so concurrent callers
 * across multiple endpoints share a single API call via dedupedXeroCall.
 */

import { dedupedXeroCall } from './xeroRateLimit'

// ---------------------------------------------------------------------------
// Shared helpers (consolidated from 4+ endpoint files)
// ---------------------------------------------------------------------------

export function ensureDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function toXeroDateTime(date: Date): string {
  return `DateTime(${date.getUTCFullYear()}, ${date.getUTCMonth() + 1}, ${date.getUTCDate()})`
}

export function flattenRows(rows: any[], out: any[] = []): any[] {
  for (const row of rows || []) {
    out.push(row)
    const children = row?.Rows || row?.rows
    if (children?.length) {
      flattenRows(children, out)
    }
  }
  return out
}

/**
 * Extract currentCash from a Xero Bank Summary report body.
 */
export function extractCurrentCash(bankReportBody: any): number {
  let total = 0
  const reportRows = bankReportBody?.reports?.[0]?.rows || bankReportBody?.Reports?.[0]?.Rows || []
  const allRows = flattenRows(reportRows)
  for (const row of allRows) {
    const cells = row?.Cells || row?.cells || []
    const lastCell = cells[cells.length - 1]
    const value = lastCell?.Value ?? lastCell?.value
    if (typeof value === 'number') {
      total += value
    } else if (typeof value === 'string') {
      const parsed = Number(value)
      if (!isNaN(parsed)) total += parsed
    }
  }
  return total
}

// ---------------------------------------------------------------------------
// Canonical Xero data fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch bank summary report. Deduped per tenant + date.
 */
export function fetchBankSummary(client: any, tenantId: string) {
  const today = new Date()
  const dateKey = ensureDateString(today)
  const fromDate = addDays(today, -30)

  return dedupedXeroCall(
    `bankSummary:${tenantId}:${dateKey}`,
    'bank-summary',
    async () => {
      const { body } = await (client.accountingApi.getReportBankSummary as any)(
        tenantId,
        ensureDateString(fromDate),
        ensureDateString(today),
        undefined,
        false
      )
      return body
    }
  )
}

/**
 * Fetch outstanding receivables (ACCREC + AUTHORISED). Deduped per tenant + date.
 */
export function fetchReceivables(client: any, tenantId: string) {
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `receivables:${tenantId}:${dateKey}`,
    'receivables',
    async () => {
      const { body } = await (client.accountingApi.getInvoices as any)(
        tenantId,
        undefined,
        'Type=="ACCREC"&&Status=="AUTHORISED"',
        'DueDate ASC',
        undefined, undefined, undefined, undefined,
        1, undefined, undefined, undefined,
        200
      )
      return body
    }
  )
}

/**
 * Fetch outstanding payables (ACCPAY + AUTHORISED). Deduped per tenant + date.
 */
export function fetchPayables(client: any, tenantId: string) {
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `payables:${tenantId}:${dateKey}`,
    'payables',
    async () => {
      const { body } = await (client.accountingApi.getInvoices as any)(
        tenantId,
        undefined,
        'Type=="ACCPAY"&&Status=="AUTHORISED"',
        'DueDate ASC',
        undefined, undefined, undefined, undefined,
        1, undefined, undefined, undefined,
        200
      )
      return body
    }
  )
}

/**
 * Fetch recent paid expenses (last 90 days). Deduped per tenant + date.
 */
export function fetchRecentPaidExpenses(client: any, tenantId: string) {
  const today = new Date()
  const dateKey = ensureDateString(today)
  const pastDate = addDays(today, -90)
  return dedupedXeroCall(
    `paidExpenses:${tenantId}:${dateKey}`,
    'paid-expenses',
    async () => {
      const { body } = await (client.accountingApi.getInvoices as any)(
        tenantId,
        undefined,
        `Type=="ACCPAY"&&Status=="PAID"&&Date>=${toXeroDateTime(pastDate)}`,
        'Date DESC',
        undefined, undefined, undefined, undefined,
        1, undefined, undefined, undefined,
        500
      )
      return body
    }
  )
}

/**
 * Fetch balance sheet as of today. Deduped per tenant + date.
 */
export function fetchBalanceSheet(client: any, tenantId: string) {
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `balanceSheet:${tenantId}:${dateKey}`,
    'balance-sheet',
    async () => {
      const { body } = await client.accountingApi.getReportBalanceSheet(tenantId, dateKey)
      return body
    }
  )
}

/**
 * Fetch contacts. Deduped per tenant + date.
 */
export function fetchContacts(client: any, tenantId: string) {
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `contacts:${tenantId}:${dateKey}`,
    'contacts',
    async () => {
      const { body } = await client.accountingApi.getContacts(
        tenantId, undefined, undefined, 'Name ASC', undefined, 1, false, false, undefined, 200
      )
      return body
    }
  )
}

/**
 * Fetch invoice summary by type and status. Deduped per unique combination.
 */
export function fetchInvoiceSummary(client: any, tenantId: string, type: 'ACCREC' | 'ACCPAY', status: string) {
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `invoiceSummary:${tenantId}:${type}:${status}:${dateKey}`,
    `${type}-${status}`,
    async () => {
      const { body } = await (client.accountingApi.getInvoices as any)(
        tenantId,
        undefined,
        `Type=="${type}"&&Status=="${status}"`,
        'Date DESC',
        undefined, undefined, undefined, undefined,
        1, undefined, undefined, undefined,
        500
      )
      return body
    }
  )
}

/**
 * Fetch outstanding receivables with AmountDue > 0. Used by insights endpoint.
 */
export function fetchOutstandingReceivables(client: any, tenantId: string) {
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `outstandingReceivables:${tenantId}:${dateKey}`,
    'invoices-outstanding',
    async () => {
      const { body } = await (client.accountingApi.getInvoices as any)(
        tenantId,
        undefined,
        'Type=="ACCREC"&&Status=="AUTHORISED"&&AmountDue>0',
        'DueDate ASC',
        undefined, undefined, undefined, undefined,
        1, undefined, undefined, undefined,
        500
      )
      return body
    }
  )
}

/**
 * Fetch quotes by status. Deduped per tenant + status + date.
 */
export function fetchQuotesByStatus(client: any, tenantId: string, status: string) {
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `quotes:${tenantId}:${status}:${dateKey}`,
    `quotes-${status}`,
    async () => {
      const { body } = await (client.accountingApi.getQuotes as any)(
        tenantId,
        undefined, undefined, undefined, undefined, undefined, undefined,
        status,
        undefined, undefined, undefined
      )
      return body
    }
  )
}

/**
 * Fetch purchase orders by status. Deduped per tenant + status + date.
 */
export function fetchPurchaseOrders(client: any, tenantId: string, status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'BILLED' | 'DELETED') {
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `purchaseOrders:${tenantId}:${status}:${dateKey}`,
    `purchase-orders-${status}`,
    async () => {
      const { body } = await (client.accountingApi.getPurchaseOrders as any)(
        tenantId,
        undefined,
        status,
        undefined, undefined, undefined,
        1,
        200
      )
      return body
    }
  )
}
