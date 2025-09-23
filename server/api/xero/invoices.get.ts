import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

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

  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)

  function simplify(inv: any) {
    return {
      id: inv.invoiceID,
      number: inv.invoiceNumber,
      contact: inv?.contact?.name,
      date: inv?.date,
      dueDate: inv?.dueDate,
      fullyPaidOnDate: inv?.fullyPaidOnDate,
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

  function agingBucketForUpcoming(daysUntilDue: number | null) {
    if (daysUntilDue == null) return 'current'
    if (daysUntilDue <= 7) return 'dueSoon'
    if (daysUntilDue <= 30) return 'due30'
    return 'current'
  }

  function agingBucketForOverdue(daysOverdue: number) {
    if (daysOverdue <= 7) return 'overdue7'
    if (daysOverdue <= 14) return 'overdue14'
    if (daysOverdue <= 30) return 'overdue30'
    return 'overdue60'
  }

  for (const inv of authorisedList) {
    const due = iso(inv.dueDate)
    if ((inv.amountDue ?? 0) > 0 && due) {
      const dueDateObj = new Date(due)
      const diffMs = dueDateObj.getTime() - today.getTime()
      const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      const ageDays = Math.ceil((today.getTime() - new Date(inv.date ?? due).getTime()) / (1000 * 60 * 60 * 24))
      const enriched = {
        ...inv,
        dueDate: due,
        date: iso(inv.date),
        daysUntilDue,
        ageDays,
        status: 'OUTSTANDING',
        agingBucket: agingBucketForUpcoming(daysUntilDue)
      }

      if (due < todayISO) {
        overdue.push({
          ...enriched,
          status: 'OVERDUE',
          daysOverdue: Math.abs(daysUntilDue),
          agingBucket: agingBucketForOverdue(Math.abs(daysUntilDue))
        })
      } else {
        outstanding.push(enriched)
      }
    }
  }

  const paidDetailed = paidList.map((inv) => {
    const paidOn = iso(inv.fullyPaidOnDate)
    const issuedOn = iso(inv.date)
    let daysToPay: number | null = null
    if (paidOn && issuedOn) {
      daysToPay = Math.max(0, Math.ceil((new Date(paidOn).getTime() - new Date(issuedOn).getTime()) / (1000 * 60 * 60 * 24)))
    }
    return {
      ...inv,
      date: issuedOn,
      fullyPaidOnDate: paidOn,
      daysToPay,
      status: 'PAID'
    }
  })

  const sumBy = (list: any[], predicate: (inv: any) => boolean) => list.reduce((total, inv) => predicate(inv) ? total + (inv.amountDue || 0) : total, 0)

  const outstandingTotal = sumBy(outstanding, () => true)
  const overdueTotal = sumBy(overdue, () => true)
  const dueSoonTotal = sumBy(outstanding, (inv) => inv.agingBucket === 'dueSoon')

  const paidLast30 = paidDetailed.filter((inv) => {
    if (!inv.fullyPaidOnDate) return false
    const paidDate = new Date(inv.fullyPaidOnDate)
    return (today.getTime() - paidDate.getTime()) <= 1000 * 60 * 60 * 24 * 30
  })

  const avgDaysToPay = (() => {
    const values = paidDetailed
      .map((inv) => inv.daysToPay)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    if (!values.length) return null
    return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length)
  })()

  const topCustomers = (() => {
    const map = new Map<string, { name: string; outstanding: number; overdue: number; count: number }>()
    const push = (inv: any, listType: 'outstanding' | 'overdue') => {
      const key = inv.contact || 'Unknown'
      if (!map.has(key)) {
        map.set(key, { name: key, outstanding: 0, overdue: 0, count: 0 })
      }
      const entry = map.get(key)!
      entry.count += 1
      const amt = inv.amountDue || 0
      if (listType === 'overdue') {
        entry.overdue += amt
      }
      entry.outstanding += amt
    }

    outstanding.forEach((inv) => push(inv, 'outstanding'))
    overdue.forEach((inv) => push(inv, 'overdue'))

    return Array.from(map.values())
      .filter((entry) => entry.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 8)
  })()

  const allInvoices = [
    ...outstanding,
    ...overdue.map((inv) => ({ ...inv, status: 'OVERDUE' })),
    ...paidDetailed
  ].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0
    const dateB = b.date ? new Date(b.date).getTime() : 0
    return dateB - dateA
  })

  const agingBuckets = {
    current: outstanding.filter((inv) => inv.agingBucket === 'current').length,
    dueSoon: outstanding.filter((inv) => inv.agingBucket === 'dueSoon').length,
    due30: outstanding.filter((inv) => inv.agingBucket === 'due30').length,
    overdue7: overdue.filter((inv) => inv.agingBucket === 'overdue7').length,
    overdue14: overdue.filter((inv) => inv.agingBucket === 'overdue14').length,
    overdue30: overdue.filter((inv) => inv.agingBucket === 'overdue30').length,
    overdue60: overdue.filter((inv) => inv.agingBucket === 'overdue60').length
  }

  const agingDetails = {
    current: outstanding.filter((inv) => inv.agingBucket === 'current'),
    dueSoon: outstanding.filter((inv) => inv.agingBucket === 'dueSoon'),
    due30: outstanding.filter((inv) => inv.agingBucket === 'due30'),
    overdue7: overdue.filter((inv) => inv.agingBucket === 'overdue7'),
    overdue14: overdue.filter((inv) => inv.agingBucket === 'overdue14'),
    overdue30: overdue.filter((inv) => inv.agingBucket === 'overdue30'),
    overdue60: overdue.filter((inv) => inv.agingBucket === 'overdue60')
  }

  return {
    summary: {
      outstandingTotal,
      outstandingCount: outstanding.length,
      overdueTotal,
      overdueCount: overdue.length,
      dueSoonTotal,
      paidLast30Total: paidLast30.reduce((sum, inv) => sum + (inv.total || 0), 0),
      paidLast30Count: paidLast30.length,
      avgDaysToPay,
      topCustomers,
      agingBuckets,
      agingDetails
    },
    outstanding,
    overdue,
    paid: paidDetailed,
    paidRecent: paidLast30,
    all: allInvoices
  }
})
