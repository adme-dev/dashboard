/**
 * Shared Xero data access layer.
 *
 * Provides canonical fetch functions for common Xero data (bank summary,
 * receivables, payables, etc.) with dedup keys so concurrent callers
 * across multiple endpoints share a single API call via dedupedXeroCall.
 */

import { dedupedXeroCall } from './xeroRateLimit'
import { xeroFetch } from './xeroClient'

// Accept either the old XeroClient-style object or a raw access token string
// so in-flight call sites can migrate incrementally without breaking.
function resolveAccessToken(clientOrToken: any): string {
  if (typeof clientOrToken === 'string') return clientOrToken
  // Legacy XeroClient: tokenSet is set on the client instance
  const ts = clientOrToken?._tokenSet ?? clientOrToken?.tokenSet
  if (ts?.access_token) return ts.access_token
  throw new Error('xeroDataFetcher: expected access token string or XeroClient with tokenSet')
}

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
export function fetchBankSummary(clientOrToken: any, tenantId: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const today = new Date()
  const dateKey = ensureDateString(today)
  const fromDate = addDays(today, -30)

  return dedupedXeroCall(
    `bankSummary:${tenantId}:${dateKey}`,
    'bank-summary',
    () => xeroFetch<any>({
      accessToken,
      tenantId,
      path: `Reports/BankSummary?fromDate=${ensureDateString(fromDate)}&toDate=${ensureDateString(today)}`,
    })
  )
}

/**
 * Fetch outstanding receivables (ACCREC + AUTHORISED). Deduped per tenant + date.
 */
export function fetchReceivables(clientOrToken: any, tenantId: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  const params = new URLSearchParams({
    where: 'Type=="ACCREC"&&Status=="AUTHORISED"',
    order: 'DueDate ASC',
    page: '1',
    pageSize: '200',
  })
  return dedupedXeroCall(
    `receivables:${tenantId}:${dateKey}`,
    'receivables',
    () => xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
  )
}

/**
 * Fetch outstanding payables (ACCPAY + AUTHORISED). Deduped per tenant + date.
 */
export function fetchPayables(clientOrToken: any, tenantId: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  const params = new URLSearchParams({
    where: 'Type=="ACCPAY"&&Status=="AUTHORISED"',
    order: 'DueDate ASC',
    page: '1',
    pageSize: '200',
  })
  return dedupedXeroCall(
    `payables:${tenantId}:${dateKey}`,
    'payables',
    () => xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
  )
}

/**
 * Fetch recent paid expenses (last 90 days). Deduped per tenant + date.
 */
export function fetchRecentPaidExpenses(clientOrToken: any, tenantId: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const today = new Date()
  const dateKey = ensureDateString(today)
  const pastDate = addDays(today, -90)
  const params = new URLSearchParams({
    where: `Type=="ACCPAY"&&Status=="PAID"&&Date>=${toXeroDateTime(pastDate)}`,
    order: 'Date DESC',
    page: '1',
    pageSize: '500',
  })
  return dedupedXeroCall(
    `paidExpenses:${tenantId}:${dateKey}`,
    'paid-expenses',
    () => xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
  )
}

/**
 * Fetch balance sheet as of today. Deduped per tenant + date.
 *
 * Uses xeroFetch (raw fetch + AbortController) instead of the xero-node SDK
 * because the SDK runs on axios under nodejs_compat on Cloudflare Pages and
 * stalls long enough to blow past the worker timeout. See xeroClient.ts
 * (`xeroFetch` docstring) for the full story.
 */
export function fetchBalanceSheet(clientOrToken: any, tenantId: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  return dedupedXeroCall(
    `balanceSheet:${tenantId}:${dateKey}`,
    'balance-sheet',
    () => xeroFetch<any>({
      accessToken,
      tenantId,
      path: `Reports/BalanceSheet?date=${dateKey}`,
    })
  )
}

/**
 * Fetch contacts. Deduped per tenant + date.
 */
export function fetchContacts(clientOrToken: any, tenantId: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  const params = new URLSearchParams({
    order: 'Name ASC',
    page: '1',
    pageSize: '200',
    summaryOnly: 'false',
    includeArchived: 'false',
  })
  return dedupedXeroCall(
    `contacts:${tenantId}:${dateKey}`,
    'contacts',
    () => xeroFetch<any>({ accessToken, tenantId, path: `Contacts?${params.toString()}` })
  )
}

/**
 * Fetch invoice summary by type and status. Deduped per unique combination.
 */
export function fetchInvoiceSummary(clientOrToken: any, tenantId: string, type: 'ACCREC' | 'ACCPAY', status: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  const params = new URLSearchParams({
    where: `Type=="${type}"&&Status=="${status}"`,
    order: 'Date DESC',
    page: '1',
    pageSize: '500',
  })
  return dedupedXeroCall(
    `invoiceSummary:${tenantId}:${type}:${status}:${dateKey}`,
    `${type}-${status}`,
    () => xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
  )
}

/**
 * Fetch outstanding receivables with AmountDue > 0. Used by insights endpoint.
 */
export function fetchOutstandingReceivables(clientOrToken: any, tenantId: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  const params = new URLSearchParams({
    where: 'Type=="ACCREC"&&Status=="AUTHORISED"&&AmountDue>0',
    order: 'DueDate ASC',
    page: '1',
    pageSize: '500',
  })
  return dedupedXeroCall(
    `outstandingReceivables:${tenantId}:${dateKey}`,
    'invoices-outstanding',
    () => xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
  )
}

/**
 * Fetch quotes by status. Deduped per tenant + status + date.
 */
export function fetchQuotesByStatus(clientOrToken: any, tenantId: string, status: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  const params = new URLSearchParams({ status })
  return dedupedXeroCall(
    `quotes:${tenantId}:${status}:${dateKey}`,
    `quotes-${status}`,
    () => xeroFetch<any>({ accessToken, tenantId, path: `Quotes?${params.toString()}` })
  )
}

/**
 * Fetch purchase orders by status. Deduped per tenant + status + date.
 */
export function fetchPurchaseOrders(clientOrToken: any, tenantId: string, status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'BILLED' | 'DELETED') {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  const params = new URLSearchParams({
    status,
    page: '1',
    pageSize: '200',
  })
  return dedupedXeroCall(
    `purchaseOrders:${tenantId}:${status}:${dateKey}`,
    `purchase-orders-${status}`,
    () => xeroFetch<any>({ accessToken, tenantId, path: `PurchaseOrders?${params.toString()}` })
  )
}
