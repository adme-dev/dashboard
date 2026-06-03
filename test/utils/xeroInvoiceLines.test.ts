import { describe, it, expect } from 'vitest'
import { normalizeInvoiceLines } from '~~/server/utils/xeroInvoiceLines'

// Pure normaliser: Xero invoice → flat line rows for the line-item cache.
// Covers the ex-GST derivation (LineAmountTypes), tracking extraction, the
// LineItemID fallback, and cent rounding.

const base = {
  invoiceID: 'INV-1',
  type: 'ACCREC',
  status: 'AUTHORISED',
  date: '2026-05-15T00:00:00',
  contact: { name: 'Acme Motors' },
}

describe('normalizeInvoiceLines', () => {
  it('derives ex-GST from EXCLUSIVE line amounts', () => {
    const rows = normalizeInvoiceLines({
      ...base, lineAmountTypes: 'Exclusive',
      lineItems: [{ lineItemID: 'L1', accountCode: '220', lineAmount: 1000, taxAmount: 100, unitAmount: 1000, quantity: 1 }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.lineExGstCents).toBe(100000) // 1000 ex-GST
    expect(rows[0]!.taxAmountCents).toBe(10000)
    expect(rows[0]!.accountCode).toBe('220')
    expect(rows[0]!.invoiceType).toBe('ACCREC')
    expect(rows[0]!.invoiceDate).toBe('2026-05-15')
    expect(rows[0]!.contactName).toBe('Acme Motors')
  })

  it('derives ex-GST from INCLUSIVE line amounts (subtracts tax)', () => {
    const rows = normalizeInvoiceLines({
      ...base, lineAmountTypes: 'Inclusive',
      lineItems: [{ lineItemID: 'L1', accountCode: '210', lineAmount: 1100, taxAmount: 100 }],
    })
    expect(rows[0]!.lineExGstCents).toBe(100000) // 1100 - 100
    expect(rows[0]!.taxAmountCents).toBe(10000)
  })

  it('treats NoTax as ex-GST with zero tax', () => {
    const rows = normalizeInvoiceLines({
      ...base, lineAmountTypes: 'NoTax',
      lineItems: [{ lineItemID: 'L1', accountCode: '330', lineAmount: 5000, taxAmount: 0 }],
    })
    expect(rows[0]!.lineExGstCents).toBe(500000)
    expect(rows[0]!.taxAmountCents).toBe(0)
  })

  it('extracts Media and Client tracking options by category name', () => {
    const rows = normalizeInvoiceLines({
      ...base, lineAmountTypes: 'Exclusive',
      lineItems: [{
        lineItemID: 'L1', accountCode: '220', lineAmount: 100, taxAmount: 10,
        tracking: [
          { name: 'Media', option: 'TV - Seven' },
          { name: 'Client', option: 'Acme Motors' },
        ],
      }],
    })
    expect(rows[0]!.trackingMedia).toBe('TV - Seven')
    expect(rows[0]!.trackingClient).toBe('Acme Motors')
  })

  it('falls back to invoiceId:idx when LineItemID is missing', () => {
    const rows = normalizeInvoiceLines({
      ...base, lineAmountTypes: 'Exclusive',
      lineItems: [
        { accountCode: '210', lineAmount: 10, taxAmount: 1 },
        { accountCode: '215', lineAmount: 20, taxAmount: 2 },
      ],
    })
    expect(rows[0]!.lineItemId).toBe('INV-1:0')
    expect(rows[1]!.lineItemId).toBe('INV-1:1')
  })

  it('captures ACCPAY (cost) invoices the same way', () => {
    const rows = normalizeInvoiceLines({
      invoiceID: 'BILL-9', type: 'ACCPAY', status: 'AUTHORISED', date: '2026-05-20',
      contact: { name: 'Meta Platforms' }, lineAmountTypes: 'NoTax',
      lineItems: [{ lineItemID: 'C1', accountCode: '330', lineAmount: 8000, taxAmount: 0 }],
    })
    expect(rows[0]!.invoiceType).toBe('ACCPAY')
    expect(rows[0]!.lineExGstCents).toBe(800000)
    expect(rows[0]!.contactName).toBe('Meta Platforms')
  })

  it('returns nothing for an invoice with no id or no lines', () => {
    expect(normalizeInvoiceLines({ type: 'ACCREC', lineItems: [] })).toEqual([])
    expect(normalizeInvoiceLines({ invoiceID: 'X', lineAmountTypes: 'Exclusive' })).toEqual([])
  })

  it('handles missing tracking gracefully', () => {
    const rows = normalizeInvoiceLines({
      ...base, lineAmountTypes: 'Exclusive',
      lineItems: [{ lineItemID: 'L1', accountCode: '210', lineAmount: 100, taxAmount: 10 }],
    })
    expect(rows[0]!.trackingMedia).toBeNull()
    expect(rows[0]!.trackingClient).toBeNull()
  })
})
