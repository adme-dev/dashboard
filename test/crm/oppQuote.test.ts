import { describe, it, expect } from 'vitest'
import { quoteTitleForOpp, mapLineItemsToQuoteItems } from '~~/server/utils/crm/oppQuote'

// Pure mappers that turn a CRM opportunity + its line-items into the payloads for
// a Pricing quote. The DB composite (createQuoteFromOpportunity) is integration-
// probed; these cover the field mapping + numeric coercion + ordering.

describe('quoteTitleForOpp', () => {
  it('uses the opportunity name', () => {
    expect(quoteTitleForOpp({ name: 'Acme Website Redesign' })).toBe('Acme Website Redesign')
  })
  it('trims whitespace', () => {
    expect(quoteTitleForOpp({ name: '  Spring Campaign  ' })).toBe('Spring Campaign')
  })
  it('falls back when name is empty/missing', () => {
    expect(quoteTitleForOpp({ name: '' })).toBe('Opportunity quote')
    expect(quoteTitleForOpp({ name: '   ' })).toBe('Opportunity quote')
    expect(quoteTitleForOpp({ name: null })).toBe('Opportunity quote')
    expect(quoteTitleForOpp({})).toBe('Opportunity quote')
  })
})

describe('mapLineItemsToQuoteItems', () => {
  it('maps description→name, copies qty/price, computes lineTotal, carries order', () => {
    const items = [
      { description: 'Design', quantity: 2, unit_price: 500, position: 0 },
      { description: 'Dev', quantity: 10, unit_price: 150, position: 1 },
    ]
    expect(mapLineItemsToQuoteItems(items)).toEqual([
      { name: 'Design', quantity: 2, unitPrice: 500, lineTotal: 1000, sortOrder: 0 },
      { name: 'Dev', quantity: 10, unitPrice: 150, lineTotal: 1500, sortOrder: 1 },
    ])
  })

  it('coerces pg NUMERIC strings to numbers', () => {
    const out = mapLineItemsToQuoteItems([
      { description: 'X', quantity: '3' as never, unit_price: '99.50' as never, position: 0 },
    ])
    expect(out[0]).toEqual({ name: 'X', quantity: 3, unitPrice: 99.5, lineTotal: 298.5, sortOrder: 0 })
  })

  it('returns an empty array for no items', () => {
    expect(mapLineItemsToQuoteItems([])).toEqual([])
  })

  it('preserves the given description verbatim (it becomes the quote item name)', () => {
    expect(mapLineItemsToQuoteItems([{ description: 'Retainer — Tier 2', quantity: 1, unit_price: 0, position: 5 }]))
      .toEqual([{ name: 'Retainer — Tier 2', quantity: 1, unitPrice: 0, lineTotal: 0, sortOrder: 5 }])
  })
})
