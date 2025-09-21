import { $fetch } from 'ofetch'
import { getTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default eventHandler(async (event) => {
  const token = await getTokenForSession(event)
  if (!token?.access_token) {
    throw createError({ statusCode: 401, statusMessage: 'Not connected' })
  }
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  // Fetch authorised (open) and paid separately, then categorize
  const base = 'https://api.xero.com/api.xro/2.0/Invoices'

  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    'xero-tenant-id': tenantId
  } as const

  const [authorised, paid] = await Promise.all([
    $fetch<any>(`${base}?where=Type=="ACCREC"&&Status=="AUTHORISED"&order=DueDate%20ASC&page=1`, { headers }),
    $fetch<any>(`${base}?where=Type=="ACCREC"&&Status=="PAID"&order=Date%20DESC&page=1`, { headers })
  ])

  const today = toISODate(new Date())

  function simplify(inv: any) {
    return {
      id: inv.InvoiceID,
      number: inv.InvoiceNumber,
      contact: inv?.Contact?.Name,
      date: inv?.DateString || inv?.Date,
      dueDate: inv?.DueDateString || inv?.DueDate,
      status: inv?.Status,
      total: inv?.Total ?? 0,
      amountPaid: inv?.AmountPaid ?? 0,
      amountDue: inv?.AmountDue ?? 0,
      currency: inv?.CurrencyCode
    }
  }

  function iso(s?: string): string | undefined {
    if (!s) return undefined
    // s may already be YYYY-MM-DD
    return s.slice(0, 10)
  }

  const authorisedList = (authorised?.Invoices || []).map(simplify)
  const paidList = (paid?.Invoices || []).map(simplify)

  const outstanding = [] as any[]
  const overdue = [] as any[]

  for (const inv of authorisedList) {
    const due = iso(inv.dueDate)
    if ((inv.amountDue ?? 0) > 0 && due && due < today) {
      overdue.push(inv)
    } else if ((inv.amountDue ?? 0) > 0) {
      outstanding.push(inv)
    }
  }

  return {
    outstanding,
    overdue,
    paid: paidList
  }
})
