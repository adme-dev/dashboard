import { createError } from 'h3'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'
import { ensureDateString } from '../../utils/xeroDataFetcher'

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const cacheKey = `xero-report:${tenantId}:invoices`

  return cachedFetch(event, cacheKey, 300, async () => {
    const dateKey = ensureDateString(new Date())

    // Page through Xero until we get a partial page (last page) or hit
    // the safety cap. Without this, /invoices silently truncated to the
    // first 100 results — agencies with >100 open invoices saw bogus
    // aging buckets because the long-tail invoices fell off.
    async function fetchAllPages(
      where: string,
      order: string,
      dedupBase: string,
      labelBase: string,
      maxPages: number,
    ): Promise<any[]> {
      const all: any[] = []
      for (let page = 1; page <= maxPages; page++) {
        const params = new URLSearchParams({
          where,
          order,
          page: String(page),
          pageSize: '100',
        })
        const body = await dedupedXeroCall(
          `${dedupBase}:${tenantId}:${dateKey}:p${page}`,
          `${labelBase}-p${page}`,
          () => xeroFetch<any>({
            accessToken: token.access_token!,
            tenantId,
            path: `Invoices?${params.toString()}`,
          })
        )
        const invoices = body?.invoices || []
        all.push(...invoices)
        if (invoices.length < 100) return all
      }
      console.warn(`[invoices] hit page cap ${maxPages} for "${labelBase}" — there may be more invoices not shown`)
      return all
    }

    // AUTHORISED: 10 pages × 100 = up to 1000 open invoices. Anything
    // bigger and the org is past where this dashboard is the right tool.
    // PAID: 3 pages × 100 = 300 most-recent paid (only the last 30 days
    // is surfaced anyway, so 300 is plenty).
    const [authorisedRaw, paidRaw] = await Promise.all([
      fetchAllPages('Type=="ACCREC"&&Status=="AUTHORISED"', 'DueDate ASC', 'invoices-accrec-authorised', 'invoices-authorised', 10),
      fetchAllPages('Type=="ACCREC"&&Status=="PAID"', 'Date DESC', 'invoices-accrec-paid', 'invoices-paid', 3),
    ])
    const authorisedBody = { invoices: authorisedRaw }
    const paidBody = { invoices: paidRaw }

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
        currency: inv?.currencyCode,
        sentToContact: Boolean(inv?.sentToContact),
        // Last Xero modification timestamp. For an unedited invoice this
        // is effectively the "entered into Xero" date — Xero has no
        // separate created field. Bumps on every subsequent edit.
        updatedDate: inv?.updatedDateUTC || null
      }
    }

    function iso(input?: string | Date | null): string | undefined {
      if (!input) return undefined
      if (typeof input === 'string') return input.slice(0, 10)
      if (input instanceof Date) return input.toISOString().slice(0, 10)
      return undefined
    }

    const authorisedList = (authorisedBody?.invoices || []).map(simplify)
    const paidList = (paidBody?.invoices || []).map(simplify)

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

    const paidDetailed = paidList.map((inv: any) => {
      const paidOn = iso(inv.fullyPaidOnDate)
      const issuedOn = iso(inv.date)
      let daysToPay: number | null = null
      if (paidOn && issuedOn) {
        daysToPay = Math.max(0, Math.ceil((new Date(paidOn).getTime() - new Date(issuedOn).getTime()) / (1000 * 60 * 60 * 24)))
      }
      return { ...inv, date: issuedOn, fullyPaidOnDate: paidOn, daysToPay, status: 'PAID' }
    })

    const sumBy = (list: any[], predicate: (inv: any) => boolean) =>
      list.reduce((total, inv) => predicate(inv) ? total + (inv.amountDue || 0) : total, 0)

    // "Outstanding" in accounting terms is total open AR — every unpaid
    // invoice with a positive amountDue, regardless of due date. The
    // `outstanding` array only holds future-due invoices; overdue ones
    // live in `overdue`. Combine them for the summary card.
    const openInvoices = [...outstanding, ...overdue]
    const outstandingTotal = sumBy(openInvoices, () => true)
    const outstandingCount = openInvoices.length
    const overdueTotal = sumBy(overdue, () => true)
    const dueSoonTotal = sumBy(outstanding, (inv) => inv.agingBucket === 'dueSoon')

    // Open invoices that were never emailed via Xero — surfaces the
    // "I forgot to send it" workflow gap. Xero's `SentToContact` is a
    // boolean set when the invoice has been emailed from Xero at least
    // once (or via the API). Manually-printed invoices stay false.
    const notSent = openInvoices.filter((inv) => inv.sentToContact === false)
    const notSentCount = notSent.length
    const notSentTotal = sumBy(notSent, () => true)

    const paidLast30 = paidDetailed.filter((inv: any) => {
      if (!inv.fullyPaidOnDate) return false
      const paidDate = new Date(inv.fullyPaidOnDate)
      return (today.getTime() - paidDate.getTime()) <= 1000 * 60 * 60 * 24 * 30
    })

    // Days Sales Outstanding (DSO) — average number of days it takes the
    // business to collect payment. Standard formula:
    //   DSO = (AR / Net Credit Sales in period) × Days in period
    // Lower is better. >45 days starts being a cash-flow warning sign.
    //
    // We compute a 30-day DSO using invoices ISSUED in the last 30 days
    // (regardless of paid/unpaid status) as the sales-in-period figure.
    // This requires both open and paid arrays — the open array contributes
    // recently-issued unpaid invoices, the paid array contributes recently-
    // issued ones that have already been collected.
    const thirtyDaysAgoISO = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10)
    const last30dInvoicedTotal = [...openInvoices, ...paidDetailed]
      .filter((inv: any) => inv.date && inv.date >= thirtyDaysAgoISO)
      .reduce((sum: number, inv: any) => sum + (Number(inv.total) || 0), 0)
    const dso30 = last30dInvoicedTotal > 0
      ? Math.round((outstandingTotal / last30dInvoicedTotal) * 30)
      : null

    // Late-payer ranking — group paid invoices by customer and surface
    // chronic offenders. Only includes customers with ≥3 paid invoices
    // (so a single big-late payment doesn't dominate). Sorted by average
    // days-to-pay descending. Used by the "Chronic Late Payers" card to
    // tell the agency owner which clients to renegotiate terms with.
    const payersMap = new Map<string, { name: string; daysToPayValues: number[]; openOverdue: number; totalBilled: number }>()
    for (const inv of paidDetailed) {
      const name = inv.contact || 'Unknown'
      if (!payersMap.has(name)) {
        payersMap.set(name, { name, daysToPayValues: [], openOverdue: 0, totalBilled: 0 })
      }
      const entry = payersMap.get(name)!
      if (typeof inv.daysToPay === 'number' && Number.isFinite(inv.daysToPay)) {
        entry.daysToPayValues.push(inv.daysToPay)
      }
      entry.totalBilled += Number(inv.total) || 0
    }
    // Augment with current overdue balance per customer
    for (const inv of overdue) {
      const name = inv.contact || 'Unknown'
      const entry = payersMap.get(name)
      if (entry) entry.openOverdue += Number(inv.amountDue) || 0
    }
    const latePayers = Array.from(payersMap.values())
      .filter((p) => p.daysToPayValues.length >= 3)
      .map((p) => {
        const avg = p.daysToPayValues.reduce((s, n) => s + n, 0) / p.daysToPayValues.length
        const max = Math.max(...p.daysToPayValues)
        return {
          name: p.name,
          avgDaysToPay: Math.round(avg),
          maxDaysToPay: max,
          paidCount: p.daysToPayValues.length,
          totalBilled: Math.round(p.totalBilled),
          openOverdue: Math.round(p.openOverdue),
        }
      })
      .sort((a, b) => b.avgDaysToPay - a.avgDaysToPay)
      .slice(0, 8)

    // Cash collection forecast — projects expected cash inflow from
    // every open invoice, bucketed by due date relative to today.
    // "Overdue" amounts assumed collectible ASAP (chase priority);
    // future buckets give the agency owner a 30-day cash visibility.
    const forecastBuckets = [
      { key: 'overdue', label: 'Overdue (chase now)', daysMin: -Infinity, daysMax: -1, total: 0, count: 0 },
      { key: 'thisWeek', label: 'This week (0-7d)', daysMin: 0, daysMax: 7, total: 0, count: 0 },
      { key: 'nextWeek', label: 'Next week (8-14d)', daysMin: 8, daysMax: 14, total: 0, count: 0 },
      { key: 'rest30', label: 'Rest of 30 days (15-30d)', daysMin: 15, daysMax: 30, total: 0, count: 0 },
      { key: 'beyond', label: 'Beyond 30 days', daysMin: 31, daysMax: Infinity, total: 0, count: 0 },
    ]
    for (const inv of openInvoices) {
      if (typeof inv.daysUntilDue !== 'number') continue
      const days = inv.daysUntilDue
      const bucket = forecastBuckets.find((b) => days >= b.daysMin && days <= b.daysMax)
      if (bucket) {
        bucket.total += Number(inv.amountDue) || 0
        bucket.count += 1
      }
    }
    const cashForecast = {
      buckets: forecastBuckets.map((b) => ({ key: b.key, label: b.label, total: Math.round(b.total), count: b.count })),
      next30Total: Math.round(
        forecastBuckets
          .filter((b) => b.key === 'thisWeek' || b.key === 'nextWeek' || b.key === 'rest30')
          .reduce((s, b) => s + b.total, 0)
      ),
      next30Count: forecastBuckets
        .filter((b) => b.key === 'thisWeek' || b.key === 'nextWeek' || b.key === 'rest30')
        .reduce((s, b) => s + b.count, 0),
    }

    const avgDaysToPay = (() => {
      const values = paidDetailed
        .map((inv: any) => inv.daysToPay)
        .filter((n: any): n is number => typeof n === 'number' && Number.isFinite(n))
      if (!values.length) return null
      return Math.round(values.reduce((sum: number, n: number) => sum + n, 0) / values.length)
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
        outstandingCount,
        overdueTotal,
        overdueCount: overdue.length,
        dueSoonTotal,
        notSentCount,
        notSentTotal,
        dso30,
        paidLast30Total: paidLast30.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0),
        paidLast30Count: paidLast30.length,
        avgDaysToPay,
        topCustomers,
        latePayers,
        cashForecast,
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
})
