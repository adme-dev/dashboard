import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function parseNumeric(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }
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

function flattenRows(rows: any[], out: any[] = []): any[] {
  for (const row of rows || []) {
    out.push(row)
    const childRows = row?.Rows || row?.rows
    if (childRows?.length) {
      flattenRows(childRows, out)
    }
  }
  return out
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function safeApiCall<T>(label: string, fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (err: any) {
    const status = err?.response?.statusCode || err?.response?.status || err?.statusCode
    if (status === 429) {
      console.warn(`[cash-flow-insights] Rate limited on ${label}, retrying once...`)
      await sleep(300)
      try {
        return await fn()
      } catch (retryErr: any) {
        console.error(`[cash-flow-insights] Retry failed for ${label}:`, retryErr)
        return null
      }
    }
    console.error(`[cash-flow-insights] Failed to fetch ${label}:`, err)
    return null
  }
}

async function fetchInvoiceSummary(client: any, tenantId: string, status: string, type: 'ACCREC' | 'ACCPAY') {
  const response = await safeApiCall(`${type}-${status}`, () =>
    client.accountingApi.getInvoices(
      tenantId,
      undefined,
      `Type=="${type}"&&Status=="${status}"`,
      'Date DESC',
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      undefined,
      undefined,
      undefined,
      500
    )
  )

  const invoices = response?.body?.invoices || []
  const total = invoices.reduce((sum: number, inv: any) => sum + (Number(inv?.total) || 0), 0)

  return {
    status,
    count: invoices.length,
    total
  }
}

async function fetchOutstandingReceivables(client: any, tenantId: string) {
  const response = await safeApiCall('invoices-outstanding', () =>
    client.accountingApi.getInvoices(
      tenantId,
      undefined,
      'Type=="ACCREC"&&Status=="AUTHORISED"&&AmountDue>0',
      'DueDate ASC',
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      undefined,
      undefined,
      undefined,
      500
    )
  )

  const invoices = response?.body?.invoices || []
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

  const summary = Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      overdueRatio: entry.totalOutstanding > 0 ? entry.overdueAmount / entry.totalOutstanding : 0,
      earliestDueDate: entry.earliestDueDate ? entry.earliestDueDate.toISOString() : null,
      latestInvoiceDate: entry.latestInvoiceDate ? entry.latestInvoiceDate.toISOString() : null,
      invoices: entry.invoices
        .sort((a, b) => {
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

  return summary
}

async function fetchQuotesByStatus(client: any, tenantId: string, status: string) {
  const response = await safeApiCall(`quotes-${status}`, () =>
    client.accountingApi.getQuotes(
      tenantId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      status,
      undefined,
      undefined,
      undefined
    )
  )

  const quotes = response?.body?.quotes || []
  const total = quotes.reduce((sum: number, quote: any) => sum + (Number(quote?.total) || 0), 0)

  return {
    status,
    count: quotes.length,
    total
  }
}

async function fetchPurchaseOrders(client: any, tenantId: string, status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'BILLED' | 'DELETED') {
  const response = await safeApiCall(`purchase-orders-${status}`, () =>
    client.accountingApi.getPurchaseOrders(
      tenantId,
      undefined,
      status,
      undefined,
      undefined,
      undefined,
      1,
      200
    )
  )

  const purchaseOrders = response?.body?.purchaseOrders || []
  const total = purchaseOrders.reduce((sum: number, po: any) => sum + (Number(po?.total) || 0), 0)

  return {
    status,
    count: purchaseOrders.length,
    total
  }
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

  return {
    currentAssets,
    currentLiabilities,
    workingCapital,
    quickRatio,
    cashBalance
  }
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const client = await createXeroClient({ tokenSet: token, event })
  const today = new Date()

  const balanceSheetResponse = await safeApiCall('balance-sheet', () =>
    client.accountingApi.getReportBalanceSheet(tenantId, ensureDateString(today))
  )

  const draftInvoices = await fetchInvoiceSummary(client, tenantId, 'DRAFT', 'ACCREC')
  const submittedInvoices = await fetchInvoiceSummary(client, tenantId, 'SUBMITTED', 'ACCREC')
  const draftBills = await fetchInvoiceSummary(client, tenantId, 'DRAFT', 'ACCPAY')
  const submittedBills = await fetchInvoiceSummary(client, tenantId, 'SUBMITTED', 'ACCPAY')

  const draftQuotes = await fetchQuotesByStatus(client, tenantId, 'DRAFT')
  const sentQuotes = await fetchQuotesByStatus(client, tenantId, 'SENT')
  const acceptedQuotes = await fetchQuotesByStatus(client, tenantId, 'ACCEPTED')

  const draftPurchaseOrders = await fetchPurchaseOrders(client, tenantId, 'DRAFT')
  const submittedPurchaseOrders = await fetchPurchaseOrders(client, tenantId, 'SUBMITTED')

  const outstandingClients = await fetchOutstandingReceivables(client, tenantId)

  const contactsResponse = await safeApiCall('contacts', () =>
    client.accountingApi.getContacts(tenantId, undefined, undefined, 'Name ASC', undefined, 1, false, false, undefined, 200)
  )

  const workingCapital = computeWorkingCapital(balanceSheetResponse?.body)

  const contacts = contactsResponse?.body?.contacts || []
  const topOutstanding = outstandingClients
    .map((entry) => {
      const contact = contacts.find((c: any) => c?.contactID === entry.contactId)
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
