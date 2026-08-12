import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/portal/invoices.vue', 'utf8')

describe('portal invoice investment page', () => {
  it('leads with payment action and transparent investment allocation', () => {
    expect(source).toContain('Invoices &amp; marketing investment')
    expect(source).toContain('Amount currently due')
    expect(source).toContain('Cash on invoices settled this financial year')
    expect(source).toContain('Your marketing investment')
    expect(source).toContain('Media & external suppliers')
    expect(source).toContain('Agency services')
    expect(source).toContain('Unclassified & adjustments')
    expect(source).toContain('<USelect')
    expect(source).toContain('period: investmentPeriod.value')
  })

  it('removes gross billing labels that can be mistaken for agency earnings', () => {
    expect(source).not.toContain('Paid This Year')
    expect(source).not.toContain('Commercial summary')
    expect(source).not.toContain('Payment planning')
    expect(source).not.toContain('Average paid invoice')
  })

  it('discloses unavailable allocation and Xero credits explicitly', () => {
    expect(source).toContain('Detailed allocation is not available for these invoices yet.')
    expect(source).toContain('Credits applied')
  })
})
