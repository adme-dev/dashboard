import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const client = await createXeroClient({ tokenSet: token })

  const [authorised, paid] = await Promise.all([
    client.accountingApi.getInvoices(
      tenantId,
      undefined,
      'Type=="ACCREC"&&Status=="AUTHORISED"',
      'DueDate ASC',
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      undefined,
      undefined,
      undefined,
      100
    ),
    client.accountingApi.getInvoices(
      tenantId,
      undefined,
      'Type=="ACCREC"&&Status=="PAID"',
      'Date DESC',
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      undefined,
      undefined,
      undefined,
      100
    )
  ])

  const today = toISODate(new Date())

  function simplify(inv: any) {
    return {
      id: inv.invoiceID,
      number: inv.invoiceNumber,
      contact: inv?.contact?.name,
      date: inv?.date,
      dueDate: inv?.dueDate,
      status: inv?.status,
      total: Number(inv?.total ?? 0),
      amountPaid: Number(inv?.amountPaid ?? 0),
      amountDue: Number(inv?.amountDue ?? 0),
      currency: inv?.currencyCode
    }
  }

  function iso(input?: string | Date | null): string | undefined {
    if (!input) return undefined
    if (typeof input === 'string') {
      return input.slice(0, 10)
    }
    if (input instanceof Date) {
      return input.toISOString().slice(0, 10)
    }
    // s may already be YYYY-MM-DD
    return undefined
  }

  const authorisedList = (authorised?.body?.invoices || []).map(simplify)
  const paidList = (paid?.body?.invoices || []).map(simplify)

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
