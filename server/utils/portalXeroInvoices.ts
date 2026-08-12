export type PortalInvoiceStatus = 'sent' | 'overdue' | 'paid'

function dateOnly(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value)
  return text.length >= 10 ? text.slice(0, 10) : null
}

export function dollarsFromCents(value: unknown): number {
  const cents = Number(value ?? 0)
  return Number.isFinite(cents) ? cents / 100 : 0
}

export function xeroInvoiceIsOverdue(invoice: {
  status?: unknown
  due_date?: unknown
  amount_due_cents?: unknown
}, today = new Date()): boolean {
  const dueDate = dateOnly(invoice.due_date)
  return String(invoice.status).toUpperCase() === 'AUTHORISED'
    && Number(invoice.amount_due_cents ?? 0) > 0
    && Boolean(dueDate && dueDate < today.toISOString().slice(0, 10))
}

export function portalStatusForXeroInvoice(invoice: {
  status?: unknown
  due_date?: unknown
  amount_due_cents?: unknown
}, today = new Date()): PortalInvoiceStatus {
  if (String(invoice.status).toUpperCase() === 'PAID') return 'paid'
  return xeroInvoiceIsOverdue(invoice, today) ? 'overdue' : 'sent'
}

export function xeroInvoiceAging(invoice: {
  status?: unknown
  due_date?: unknown
  amount_due_cents?: unknown
}, today = new Date()): { daysOverdue: number, agingBucket: string, isOverdue: boolean } {
  if (!xeroInvoiceIsOverdue(invoice, today)) {
    return { daysOverdue: 0, agingBucket: 'current', isOverdue: false }
  }

  const dueDate = new Date(`${dateOnly(invoice.due_date)}T00:00:00Z`)
  const todayDate = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`)
  const daysOverdue = Math.max(0, Math.floor((todayDate.getTime() - dueDate.getTime()) / 86_400_000))

  let agingBucket = 'current'
  if (daysOverdue > 60) agingBucket = '90+'
  else if (daysOverdue > 30) agingBucket = '60d'
  else if (daysOverdue > 0) agingBucket = '30d'

  return { daysOverdue, agingBucket, isOverdue: true }
}
