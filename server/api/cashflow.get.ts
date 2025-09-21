import { $fetch } from 'ofetch'

function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default eventHandler(async (event) => {
  const today = new Date()
  const todayStr = ensureDateString(today)

  const [bank, invoices] = await Promise.all([
    $fetch<any>('/api/xero/reports/bank-summary', { headers: event.headers }),
    $fetch<any>('/api/xero/invoices', { headers: event.headers })
  ])

  const starting = bank?.totalBalance ?? 0

  const buckets = [
    { label: '30d', end: addDays(today, 30), inflow: 0, outflow: 0 },
    { label: '60d', end: addDays(today, 60), inflow: 0, outflow: 0 },
    { label: '90d', end: addDays(today, 90), inflow: 0, outflow: 0 }
  ]

  function parseDate(s?: string): Date | undefined {
    if (!s) return undefined
    const d = new Date(s)
    return isNaN(+d) ? undefined : d
  }

  // For ACCREC invoices, amountDue is cash in; for simplicity, treat amountPaid in Paid list as already realized
  for (const inv of (invoices?.outstanding || []).concat(invoices?.overdue || [])) {
    const due = parseDate(inv?.dueDate)
    if (!due) continue
    for (const b of buckets) {
      if (due <= b.end) {
        b.inflow += inv?.amountDue ?? 0
        break
      }
    }
  }

  const result = buckets.map((b) => ({
    label: b.label,
    end: ensureDateString(b.end),
    inflow: Math.round(b.inflow),
    outflow: Math.round(b.outflow),
    projected: Math.round(starting + b.inflow - b.outflow)
  }))

  return { asOf: todayStr, startingBalance: starting, buckets: result }
})
