import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function daysBetween(date1: Date, date2: Date) {
  const diffTime = Math.abs(date2.getTime() - date1.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function getAgingBucket(daysPastDue: number) {
  if (daysPastDue <= 0) return 'current'
  if (daysPastDue <= 30) return '1-30'
  if (daysPastDue <= 60) return '31-60'
  if (daysPastDue <= 90) return '61-90'
  return '90+'
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const reportType = String(query.type || 'receivables') // 'receivables' or 'payables'
  const today = new Date()

  const client = await createXeroClient({ tokenSet: token, event })

  // Determine invoice type based on report
  const invoiceType = reportType === 'receivables' ? 'ACCREC' : 'ACCPAY'
  const statusFilter = 'AUTHORISED'

  // Fetch outstanding invoices
  const { body: invoicesResponse } = await client.accountingApi.getInvoices(
    tenantId,
    undefined,
    `Type=="${invoiceType}"&&Status=="${statusFilter}"`,
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

  const invoices = invoicesResponse?.invoices || []

  // Process invoices into aging buckets
  const agingData = {
    current: { amount: 0, count: 0, invoices: [] as any[] },
    '1-30': { amount: 0, count: 0, invoices: [] as any[] },
    '31-60': { amount: 0, count: 0, invoices: [] as any[] },
    '61-90': { amount: 0, count: 0, invoices: [] as any[] },
    '90+': { amount: 0, count: 0, invoices: [] as any[] }
  }

  let totalOutstanding = 0
  const contactSummary = new Map<string, { amount: number, count: number, oldestDays: number }>()

  for (const invoice of invoices) {
    const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null
    const amountDue = Number(invoice?.amountDue) || 0
    const contactName = invoice?.contact?.name || 'Unknown'
    
    if (!dueDate || amountDue <= 0) continue

    const daysPastDue = daysBetween(dueDate, today)
    const bucket = getAgingBucket(daysPastDue)
    
    const invoiceData = {
      id: invoice.invoiceID,
      number: invoice.invoiceNumber,
      contact: contactName,
      dueDate: ensureDateString(dueDate),
      amount: amountDue,
      daysPastDue,
      status: invoice.status
    }

    agingData[bucket].amount += amountDue
    agingData[bucket].count += 1
    agingData[bucket].invoices.push(invoiceData)
    totalOutstanding += amountDue

    // Update contact summary
    const existing = contactSummary.get(contactName) || { amount: 0, count: 0, oldestDays: 0 }
    contactSummary.set(contactName, {
      amount: existing.amount + amountDue,
      count: existing.count + 1,
      oldestDays: Math.max(existing.oldestDays, daysPastDue)
    })
  }

  // Convert contact summary to array and sort
  const topContacts = Array.from(contactSummary.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  // Calculate aging percentages
  const agingSummary = Object.entries(agingData).map(([bucket, data]) => ({
    bucket,
    amount: Math.round(data.amount * 100) / 100,
    count: data.count,
    percentage: totalOutstanding > 0 ? Math.round((data.amount / totalOutstanding) * 100 * 100) / 100 : 0
  }))

  // Calculate key metrics
  const averageDaysPastDue = invoices.length > 0 
    ? invoices.reduce((sum, inv) => {
        const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
        return sum + (dueDate ? daysBetween(dueDate, today) : 0)
      }, 0) / invoices.length
    : 0

  const criticalCount = agingData['90+'].count
  const criticalAmount = agingData['90+'].amount

  return {
    reportType,
    asOfDate: ensureDateString(today),
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalInvoices: invoices.length,
    averageDaysPastDue: Math.round(averageDaysPastDue * 100) / 100,
    criticalCount,
    criticalAmount: Math.round(criticalAmount * 100) / 100,
    agingSummary,
    agingDetails: agingData,
    topContacts,
    trends: {
      // This could be enhanced with historical data comparison
      weekOverWeek: null,
      monthOverMonth: null
    }
  }
})
