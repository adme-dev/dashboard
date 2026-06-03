import { describe, it, expect } from 'vitest'
import {
  indexInvoicesByContact,
  quoteHasMatchingInvoice,
  type MatchInvoice,
} from '~~/server/utils/quoteInvoiceMatch'

// Heuristic that decides whether an open SENT quote already converted to an
// invoice (and was never marked Accepted in Xero). Pure — these cover the
// contact/date-window/amount-tolerance gates and the boundary conditions.

function idx(invoices: MatchInvoice[]) {
  return indexInvoicesByContact(invoices)
}

describe('indexInvoicesByContact', () => {
  it('groups invoices by contact and skips blank contactIds', () => {
    const map = idx([
      { contactId: 'a', date: '2026-01-01', totalCents: 100 },
      { contactId: 'a', date: '2026-02-01', totalCents: 200 },
      { contactId: 'b', date: '2026-01-01', totalCents: 300 },
      { contactId: '', date: '2026-01-01', totalCents: 400 },
    ])
    expect(map.get('a')).toHaveLength(2)
    expect(map.get('b')).toHaveLength(1)
    expect(map.has('')).toBe(false)
  })
})

describe('quoteHasMatchingInvoice', () => {
  const quote = { contactId: 'c1', date: '2026-01-10', total: 5000 }

  it('matches an invoice for the same contact, after the quote, within amount tolerance', () => {
    const map = idx([{ contactId: 'c1', date: '2026-02-01', totalCents: 5000 * 100 }])
    expect(quoteHasMatchingInvoice(quote, map)).toBe(true)
  })

  it('matches within the ±20% default tolerance band', () => {
    const map = idx([{ contactId: 'c1', date: '2026-02-01', totalCents: 5800 * 100 }]) // +16%
    expect(quoteHasMatchingInvoice(quote, map)).toBe(true)
  })

  it('rejects invoices outside the amount tolerance', () => {
    const map = idx([{ contactId: 'c1', date: '2026-02-01', totalCents: 9000 * 100 }]) // +80%
    expect(quoteHasMatchingInvoice(quote, map)).toBe(false)
  })

  it('rejects invoices dated before the quote', () => {
    const map = idx([{ contactId: 'c1', date: '2026-01-05', totalCents: 5000 * 100 }])
    expect(quoteHasMatchingInvoice(quote, map)).toBe(false)
  })

  it('rejects invoices beyond the date window', () => {
    const map = idx([{ contactId: 'c1', date: '2026-06-01', totalCents: 5000 * 100 }]) // ~142d later
    expect(quoteHasMatchingInvoice(quote, map, { windowDays: 120 })).toBe(false)
  })

  it('honours a custom window', () => {
    const map = idx([{ contactId: 'c1', date: '2026-06-01', totalCents: 5000 * 100 }])
    expect(quoteHasMatchingInvoice(quote, map, { windowDays: 200 })).toBe(true)
  })

  it('requires a contact match', () => {
    const map = idx([{ contactId: 'other', date: '2026-02-01', totalCents: 5000 * 100 }])
    expect(quoteHasMatchingInvoice(quote, map)).toBe(false)
  })

  it('ignores quotes with no contact or non-positive total', () => {
    const map = idx([{ contactId: 'c1', date: '2026-02-01', totalCents: 5000 * 100 }])
    expect(quoteHasMatchingInvoice({ contactId: '', date: '2026-01-10', total: 5000 }, map)).toBe(false)
    expect(quoteHasMatchingInvoice({ contactId: 'c1', date: '2026-01-10', total: 0 }, map)).toBe(false)
  })

  it('returns false when the contact has no invoices', () => {
    expect(quoteHasMatchingInvoice(quote, new Map())).toBe(false)
  })

  it('matches on the same-day boundary (invoice on the quote date)', () => {
    const map = idx([{ contactId: 'c1', date: '2026-01-10', totalCents: 5000 * 100 }])
    expect(quoteHasMatchingInvoice(quote, map)).toBe(true)
  })
})
