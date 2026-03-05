import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { cachedFetch } from '../../../utils/kv'
import {
  flattenRows,
  fetchBalanceSheet,
  fetchContacts,
  fetchInvoiceSummary,
  fetchOutstandingReceivables,
  fetchQuotesByStatus,
  fetchPurchaseOrders
} from '../../../utils/xeroDataFetcher'

function parseNumeric(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const isNegative = value.includes('(') && value.includes(')')
    const cleaned = value.replace(/[^0-9.\-]/g, '')
    const num = Number(cleaned || 0)
    return isNegative ? -Math.abs(num) : num
  }
  return 0
}

function extractValueFromRow(row: any): number {
  const cells = row?.Cells || row?.cells || []
  if (!cells.length) return 0
  return parseNumeric(cells[cells.length - 1]?.Value ?? cells[cells.length - 1]?.value)
}

function computeWorkingCapital(report: any) {
  const rows = report?.reports?.[0]?.rows || report?.Reports?.[0]?.Rows || []
  const flatRows = flattenRows(rows)

  const totalCurrentAssets = flatRows.find((row) => {
    const title = row?.Title || row?.title || row?.Cells?.[0]?.Value || row?.cells?.[0]?.value
    return typeof title === 'string' && title.toLowerCase().includes('total current assets')
  })
  const totalCurrentLiabilities = flatRows.find((row) => {
    const title = row?.Title || row?.title || row?.Cells?.[0]?.Value || row?.cells?.[0]?.value
    return typeof title === 'string' && title.toLowerCase().includes('total current liabilities')
  })
  const cashRow = flatRows.find((row) => {
    const title = row?.Title || row?.title || row?.Cells?.[0]?.Value || row?.cells?.[0]?.value
    return typeof title === 'string' && title.toLowerCase().includes('bank')
  })

  const currentAssets = extractValueFromRow(totalCurrentAssets)
  const currentLiabilities = extractValueFromRow(totalCurrentLiabilities)
  const cashBalance = extractValueFromRow(cashRow)
  const workingCapital = currentAssets - currentLiabilities
  const quickRatio = currentLiabilities !== 0 ? currentAssets / currentLiabilities : null

  return { currentAssets, currentLiabilities, workingCapital, quickRatio, cashBalance }
}

function processOutstandingClients(invoicesBody: any) {
  const invoices = invoicesBody?.invoices || []
  const today = new Date()
  const grouped = new Map<string, any>()

  for (const invoice of invoices) {
    const contact = invoice?.contact
    if (!contact?.contactID) continue

    const key = contact.contactID
    const amountDue = Number(invoice?.amountDue) || 0
    const total = Number(invoice?.total) || 0
    const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null
    const invoiceDate = invoice?.date ? new Date(invoice.date) : null
    const isOverdue = !!(dueDate && dueDate < today)

    if (!grouped.has(key)) {
      grouped.set(key, {
        contactId: key,
        name: contact?.name || 'Unknown Client',
        totalOutstanding: 0,
        totalInvoices: 0,
        overdueAmount: 0,
        overdueCount: 0,
        earliestDueDate: null as Date | null,
        latestInvoiceDate: null as Date | null,
        invoices: [] as any[]
      })
    }

    const entry = grouped.get(key)
    entry.totalOutstanding += amountDue
    entry.totalInvoices += 1
    if (isOverdue) {
      entry.overdueAmount += amountDue
      entry.overdueCount += 1
    }

    if (!entry.earliestDueDate || (dueDate && dueDate < entry.earliestDueDate)) {
      entry.earliestDueDate = dueDate
    }
    if (!entry.latestInvoiceDate || (invoiceDate && invoiceDate > entry.latestInvoiceDate)) {
      entry.latestInvoiceDate = invoiceDate
    }

    entry.invoices.push({
      id: invoice.invoiceID,
      number: invoice.invoiceNumber,
      reference: invoice.reference,
      amountDue,
      total,
      dueDate: dueDate ? dueDate.toISOString() : null,
      date: invoiceDate ? invoiceDate.toISOString() : null,
      isOverdue
    })
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      overdueRatio: entry.totalOutstanding > 0 ? entry.overdueAmount / entry.totalOutstanding : 0,
      earliestDueDate: entry.earliestDueDate ? entry.earliestDueDate.toISOString() : null,
      latestInvoiceDate: entry.latestInvoiceDate ? entry.latestInvoiceDate.toISOString() : null,
      invoices: entry.invoices
        .sort((a: any, b: any) => {
          const da = a.dueDate ? new Date(a.dueDate) : null
          const db = b.dueDate ? new Date(b.dueDate) : null
          if (da && db) return da.getTime() - db.getTime()
          if (da) return -1
          if (db) return 1
          return 0
        })
        .slice(0, 3)
    }))
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
}

function summarizeInvoices(body: any, status: string) {
  const invoices = body?.invoices || []
  const total = invoices.reduce((sum: number, inv: any) => sum + (Number(inv?.total) || 0), 0)
  return { status, count: invoices.length, total }
}

function summarizeQuotes(body: any, status: string) {
  const quotes = body?.quotes || []
  const total = quotes.reduce((sum: number, q: any) => sum + (Number(q?.total) || 0), 0)
  return { status, count: quotes.length, total }
}

function summarizePurchaseOrders(body: any, status: string) {
  const purchaseOrders = body?.purchaseOrders || []
  const total = purchaseOrders.reduce((sum: number, po: any) => sum + (Number(po?.total) || 0), 0)
  return { status, count: purchaseOrders.length, total }
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const cacheKey = `xero-report:${tenantId}:cash-flow-insights`

  return cachedFetch(event, cacheKey, 600, async () => {
    const client = await createXeroClient({ tokenSet: token, event })
    const today = new Date()

    // All calls go through dedupedXeroCall (rate-limited + deduped)
    const [
      balanceSheetBody,
      draftInvoicesBody,
      submittedInvoicesBody,
      draftBillsBody,
      submittedBillsBody,
      draftQuotesBody,
      sentQuotesBody,
      acceptedQuotesBody,
      draftPOsBody,
      submittedPOsBody,
      outstandingBody,
      contactsBody
    ] = await Promise.all([
      fetchBalanceSheet(client, tenantId),
      fetchInvoiceSummary(client, tenantId, 'ACCREC', 'DRAFT'),
      fetchInvoiceSummary(client, tenantId, 'ACCREC', 'SUBMITTED'),
      fetchInvoiceSummary(client, tenantId, 'ACCPAY', 'DRAFT'),
      fetchInvoiceSummary(client, tenantId, 'ACCPAY', 'SUBMITTED'),
      fetchQuotesByStatus(client, tenantId, 'DRAFT'),
      fetchQuotesByStatus(client, tenantId, 'SENT'),
      fetchQuotesByStatus(client, tenantId, 'ACCEPTED'),
      fetchPurchaseOrders(client, tenantId, 'DRAFT'),
      fetchPurchaseOrders(client, tenantId, 'SUBMITTED'),
      fetchOutstandingReceivables(client, tenantId),
      fetchContacts(client, tenantId)
    ])

    const workingCapital = computeWorkingCapital(balanceSheetBody)

    const draftInvoices = summarizeInvoices(draftInvoicesBody, 'DRAFT')
    const submittedInvoices = summarizeInvoices(submittedInvoicesBody, 'SUBMITTED')
    const draftBills = summarizeInvoices(draftBillsBody, 'DRAFT')
    const submittedBills = summarizeInvoices(submittedBillsBody, 'SUBMITTED')

    const draftQuotes = summarizeQuotes(draftQuotesBody, 'DRAFT')
    const sentQuotes = summarizeQuotes(sentQuotesBody, 'SENT')
    const acceptedQuotes = summarizeQuotes(acceptedQuotesBody, 'ACCEPTED')

    const draftPurchaseOrders = summarizePurchaseOrders(draftPOsBody, 'DRAFT')
    const submittedPurchaseOrders = summarizePurchaseOrders(submittedPOsBody, 'SUBMITTED')

    const outstandingClients = processOutstandingClients(outstandingBody)

    const contacts = contactsBody?.contacts || []
    const topOutstanding = outstandingClients
      .map((entry) => {
        const contact = contacts.find((c: any) => c?.contactID === entry.contactId) as any
        const creditLimit = contact?.creditLimit ? Number(contact.creditLimit) : undefined
        return {
          id: entry.contactId,
          name: entry.name,
          outstanding: entry.totalOutstanding,
          overdue: entry.overdueAmount,
          overdueRatio: entry.overdueRatio,
          creditLimit,
          invoiceCount: entry.totalInvoices,
          overdueCount: entry.overdueCount,
          earliestDueDate: entry.earliestDueDate,
          latestInvoiceDate: entry.latestInvoiceDate,
          sampleInvoices: entry.invoices
        }
      })
      .slice(0, 8)

    return {
      generatedAt: today.toISOString(),
      workingCapital,
      receivables: {
        draftInvoices,
        submittedInvoices,
        quotes: {
          draft: draftQuotes,
          sent: sentQuotes,
          accepted: acceptedQuotes,
          totalPipeline: (draftQuotes?.total || 0) + (sentQuotes?.total || 0) + (acceptedQuotes?.total || 0)
        }
      },
      payables: {
        draftBills,
        submittedBills,
        purchaseOrders: {
          draft: draftPurchaseOrders,
          submitted: submittedPurchaseOrders,
          totalPipeline: (draftPurchaseOrders?.total || 0) + (submittedPurchaseOrders?.total || 0)
        }
      },
      clients: {
        topOutstanding
      }
    }
  })
})
