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

export type BankAccountBalance = {
  accountId: string | null
  name: string
  /** Closing balance for the account. Negative on a drawn-down credit card. */
  balance: number
  isCreditCard: boolean
}

export type BankBalanceBreakdown = {
  /** Liquid cash — true bank accounts only, credit cards excluded. */
  cash: number
  /** Credit-card balances. Negative when drawn down. */
  creditCard: number
  /** cash + creditCard, i.e. net across every Type=BANK account. */
  net: number
  accounts: BankAccountBalance[]
}

/**
 * Pull the account-level closing balances out of a Xero BankSummary report.
 *
 * Xero nests the account rows inside a Section and appends a `SummaryRow`
 * holding the column total. Summing every flattened row therefore counted the
 * total twice — once as the accounts, once as the summary — and returned
 * exactly 2x the real balance. Only `RowType === 'Row'` carries an account.
 *
 * Credit cards come back from Xero as `Type=BANK` with
 * `BankAccountType=CREDITCARD`, so they are indistinguishable inside the
 * report itself. Pass `creditCardAccountIds` (see `creditCardAccountIdsFrom`)
 * to keep card debt out of the cash figure. With no set supplied every account
 * counts as cash, which preserves the previous whole-portfolio meaning.
 */
export function extractBankBalances(
  bankReportBody: any,
  creditCardAccountIds?: Set<string>
): BankBalanceBreakdown {
  const reportRows = bankReportBody?.reports?.[0]?.rows || bankReportBody?.Reports?.[0]?.Rows || []
  const accounts: BankAccountBalance[] = []

  for (const row of flattenRows(reportRows)) {
    // Header / Section / SummaryRow never describe an account. Tolerate a
    // missing RowType so hand-built or legacy payloads still parse.
    const rowType = row?.RowType ?? row?.rowType
    if (rowType != null && String(rowType).toLowerCase() !== 'row') continue

    const cells = row?.Cells || row?.cells || []
    if (!cells.length) continue

    const lastCell = cells[cells.length - 1]
    const rawBalance = lastCell?.Value ?? lastCell?.value
    const balance = typeof rawBalance === 'number' ? rawBalance : Number(rawBalance)
    if (!Number.isFinite(balance)) continue

    const nameCell = cells[0]
    const name = String(nameCell?.Value ?? nameCell?.value ?? '').trim()
    const attributes = nameCell?.Attributes || nameCell?.attributes || []
    const idAttr = attributes.find((a: any) => String(a?.Id ?? a?.id) === 'accountID')
    const accountId: string | null = idAttr ? String(idAttr.Value ?? idAttr.value) : null

    accounts.push({
      accountId,
      name,
      balance,
      isCreditCard: Boolean(accountId && creditCardAccountIds?.has(accountId))
    })
  }

  let cash = 0
  let creditCard = 0
  for (const a of accounts) {
    if (a.isCreditCard) creditCard += a.balance
    else cash += a.balance
  }

  return { cash, creditCard, net: cash + creditCard, accounts }
}

/**
 * Extract currentCash from a Xero Bank Summary report body.
 *
 * Without `creditCardAccountIds` this is the net across all bank-type
 * accounts; with them it is liquid cash only. Runway/forecast callers should
 * pass the set — dividing a card-debt-net balance by daily burn is meaningless.
 */
export function extractCurrentCash(bankReportBody: any, creditCardAccountIds?: Set<string>): number {
  return extractBankBalances(bankReportBody, creditCardAccountIds).cash
}

/**
 * Names of every account Xero's BankSummary lists for the requested window,
 * including zero-balance ones. Xero omits accounts with no balance and no
 * movement in the period, so this is the set that can have trend data.
 */
export function bankSummaryAccountNames(bankReportBody: any): Set<string> {
  const names = new Set<string>()
  for (const a of extractBankBalances(bankReportBody).accounts) {
    if (a.name) names.add(a.name)
  }
  return names
}

/**
 * Split accounts into those worth pulling bank transactions for and those that
 * can be skipped. Fetching transactions is one Xero round-trip per account, so
 * dormant/closed accounts absent from the summary are pure latency — they can
 * only ever yield an empty series.
 *
 * Fails safe: an empty name set means the summary was missing or unparseable,
 * and we cannot tell that apart from "genuinely no activity". Skipping every
 * account there would silently flatten all trends, so fall back to fetching all.
 */
export function partitionAccountsForTrends<T extends { name?: string | null }>(
  bankAccounts: T[],
  summaryAccountNames: Set<string>
): { withActivity: T[], skipped: T[] } {
  if (summaryAccountNames.size === 0) return { withActivity: [...bankAccounts], skipped: [] }

  const withActivity: T[] = []
  const skipped: T[] = []
  for (const account of bankAccounts) {
    if (summaryAccountNames.has(String(account?.name ?? '').trim())) withActivity.push(account)
    else skipped.push(account)
  }
  return { withActivity, skipped }
}

/** Collect the AccountIDs of every CREDITCARD account in a Xero Accounts payload. */
export function creditCardAccountIdsFrom(accountsBody: any): Set<string> {
  const accounts = accountsBody?.Accounts || accountsBody?.accounts || []
  const ids = new Set<string>()
  for (const a of accounts) {
    const type = String(a?.BankAccountType ?? a?.bankAccountType ?? '').toUpperCase()
    const id = a?.AccountID ?? a?.accountID ?? a?.accountId
    if (type === 'CREDITCARD' && id) ids.add(String(id))
  }
  return ids
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
 * Fetch every bank-type account (this includes credit cards — Xero models them
 * as Type=BANK with BankAccountType=CREDITCARD). Deduped per tenant + date.
 */
export function fetchBankAccounts(clientOrToken: any, tenantId: string) {
  const accessToken = resolveAccessToken(clientOrToken)
  const dateKey = ensureDateString(new Date())
  const params = new URLSearchParams({ where: 'Type=="BANK"', order: 'Name ASC' })
  return dedupedXeroCall(
    `bankAccounts:${tenantId}:${dateKey}`,
    'bank-accounts',
    () => xeroFetch<any>({ accessToken, tenantId, path: `Accounts?${params.toString()}` })
  )
}

/**
 * Bank summary + account types in one call, returning cash split from credit
 * card debt. Prefer this over `fetchBankSummary` + `extractCurrentCash` for
 * anything that reports a cash balance or divides one by a burn rate.
 *
 * Both underlying calls are deduped, so concurrent callers share them.
 */
export async function fetchBankBalances(
  clientOrToken: any,
  tenantId: string
): Promise<BankBalanceBreakdown> {
  const accessToken = resolveAccessToken(clientOrToken)
  const [report, accountsBody] = await Promise.all([
    fetchBankSummary(accessToken, tenantId),
    // Account metadata only refines the cash/credit split — if it fails we
    // still return a correct net figure rather than failing the whole call.
    fetchBankAccounts(accessToken, tenantId).catch((err: any) => {
      console.warn('[xeroDataFetcher] bank accounts fetch failed, treating all accounts as cash:', err?.message)
      return null
    })
  ])
  return extractBankBalances(report, creditCardAccountIdsFrom(accountsBody))
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
