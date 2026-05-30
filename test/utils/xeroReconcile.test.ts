// test/utils/xeroReconcile.test.ts
import { describe, it, expect } from 'vitest'
import { locationKey, buildReconcileCandidates } from '~~/server/utils/xeroReconcile'

const CLIENTS = [
  { id: 'c-northern', name: 'Northern Motor Group' },
  { id: 'c-frankston', name: 'Frankston Motor Group' }
]

function cust(contactId: string, name: string) {
  return { contactId, name, tenantId: 't1', receivableCents: 1000 }
}

describe('locationKey', () => {
  it('strips trailing " Motor Group"', () => {
    expect(locationKey('Northern Motor Group')).toBe('northern')
  })
  it('keeps a name without the suffix', () => {
    expect(locationKey('Harmony New Energy')).toBe('harmony new energy')
  })
})

describe('buildReconcileCandidates', () => {
  it('attaches the existing client a Xero brand prefix-matches', () => {
    const out = buildReconcileCandidates([cust('x1', 'Northern KIA')], CLIENTS, new Set())
    expect(out[0].matchedClientId).toBe('c-northern')
  })
  it('returns null match for an unrepresented customer', () => {
    const out = buildReconcileCandidates([cust('x2', 'Brighton GWM')], CLIENTS, new Set())
    expect(out[0].matchedClientId).toBeNull()
  })
  it('excludes already-linked contacts', () => {
    const out = buildReconcileCandidates([cust('x3', 'Frankston Nissan')], CLIENTS, new Set(['x3']))
    expect(out).toHaveLength(0)
  })
  it('preserves receivable + tenant on the candidate', () => {
    const out = buildReconcileCandidates([cust('x4', 'Brighton Nissan')], CLIENTS, new Set())
    expect(out[0]).toMatchObject({ contactId: 'x4', tenantId: 't1', receivableCents: 1000, matchedClientId: null })
  })
})
