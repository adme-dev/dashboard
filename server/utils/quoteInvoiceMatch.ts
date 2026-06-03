/**
 * Heuristic matcher: does an open `SENT` Xero quote actually correspond to an
 * invoice that was already raised?
 *
 * Why this exists: many agencies send a quote, win the work, and raise the
 * invoice **directly** — without ever moving the quote off `SENT` in Xero. The
 * quote then lingers as "sent" forever and naive pipeline reporting flags it as
 * a stale/dead lead that should be chased or archived, when in fact it was won.
 *
 * We treat a quote as "won (unmarked)" when the same contact has a non-draft
 * ACCREC invoice dated on/after the quote (within a window) whose total is
 * within a tolerance band of the quote total. It is deliberately a heuristic —
 * scope and price drift between quote and invoice, so the amount match is
 * fuzzy and the date window is generous.
 */

export interface MatchInvoice {
  contactId: string
  date: string        // ISO yyyy-mm-dd
  totalCents: number
}

export interface MatchQuote {
  contactId: string
  date: string        // ISO yyyy-mm-dd (quote issue date)
  total: number       // dollars
}

export interface MatchOptions {
  /** How many days after the quote an invoice can land and still count. */
  windowDays?: number
  /** Fractional tolerance on the amount match (0.2 = ±20%). */
  tolerance?: number
}

/**
 * Group invoices by contact for O(1) lookup during matching.
 */
export function indexInvoicesByContact(invoices: MatchInvoice[]): Map<string, MatchInvoice[]> {
  const map = new Map<string, MatchInvoice[]>()
  for (const inv of invoices) {
    if (!inv.contactId) continue
    const arr = map.get(inv.contactId)
    if (arr) arr.push(inv)
    else map.set(inv.contactId, [inv])
  }
  return map
}

/**
 * True when this SENT quote most likely already converted to an invoice.
 */
export function quoteHasMatchingInvoice(
  quote: MatchQuote,
  invoicesByContact: Map<string, MatchInvoice[]>,
  opts: MatchOptions = {},
): boolean {
  const windowDays = opts.windowDays ?? 120
  const tolerance = opts.tolerance ?? 0.2
  if (!quote.contactId || quote.total <= 0) return false

  const invs = invoicesByContact.get(quote.contactId)
  if (!invs || invs.length === 0) return false

  const qMs = Date.parse(quote.date + 'T00:00:00Z')
  if (Number.isNaN(qMs)) return false
  const windowEndMs = qMs + windowDays * 86_400_000

  const lo = quote.total * (1 - tolerance)
  const hi = quote.total * (1 + tolerance)

  for (const inv of invs) {
    const iMs = Date.parse(inv.date + 'T00:00:00Z')
    if (Number.isNaN(iMs)) continue
    // Invoice must land on/after the quote and inside the window.
    if (iMs < qMs || iMs > windowEndMs) continue
    const dollars = inv.totalCents / 100
    if (dollars >= lo && dollars <= hi) return true
  }
  return false
}
