import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const policy = readFileSync(
  new URL('../../app/pages/privacy.vue', import.meta.url),
  'utf8'
)

describe('XeroFlow privacy policy tracking disclosures', () => {
  it('explains XeroFlow and customer privacy roles', () => {
    expect(policy).toContain('acts as a <strong')
    expect(policy).toContain('controller</strong>')
    expect(policy).toContain('processor or service provider</strong>')
    expect(policy).toContain('the customer &mdash; usually the dealership or dealer group &mdash; controls the Customer Data')
    expect(policy).toContain('does not replace, the privacy notice that the relevant customer must provide at or before collection')
  })

  it('discloses the dealership tracking and lead data flow', () => {
    expect(policy).toContain('Dealership website tracking, attribution, and lead data')
    expect(policy).toContain('name, email address, phone number')
    expect(policy).toContain('GCLID, GBRAID, WBRAID, FBCLID, FBC, FBP')
    expect(policy).toContain('a salted hash of the IP address')
    expect(policy).toContain('Podium or Xtime iframe engagement')
    expect(policy).toContain('The standard form listener records form metadata and interaction events')
    expect(policy).toContain('Website tracking initially uses pseudonymous identifiers')
    expect(policy).toContain('XeroFlow marketing communications provide an unsubscribe')
  })

  it('states jurisdiction-specific breach timing and current contact details', () => {
    expect(policy).toContain('within 30 days')
    expect(policy).toContain('within 72 hours where legally required')
    expect(policy).toContain('privacy@xeroflow.io')
    expect(policy).not.toContain('privacy@xeroflow.agency')
    expect(policy).not.toContain('aggregated, anonymised usage analytics')
  })
})
