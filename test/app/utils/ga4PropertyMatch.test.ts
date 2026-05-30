// test/app/utils/ga4PropertyMatch.test.ts
import { describe, expect, it } from 'vitest'
import { matchPropertiesToClients, locationKey, normalizeProperty } from '~~/app/utils/ga4PropertyMatch'

const CLIENTS = [
  { id: 'c-northern', name: 'Northern Motor Group' },
  { id: 'c-geelong', name: 'Geelong Motor Group' },
  { id: 'c-pak', name: 'Pakenham Isuzu UTE' }
]

describe('locationKey', () => {
  it('strips a trailing " Motor Group"', () => {
    expect(locationKey('Northern Motor Group')).toBe('northern')
  })
  it('keeps the full name when there is no Motor Group suffix', () => {
    expect(locationKey('Pakenham Isuzu UTE')).toBe('pakenham isuzu ute')
  })
})

describe('normalizeProperty', () => {
  it('lowercases and strips a trailing "- GA4"', () => {
    expect(normalizeProperty('Northern KIA - GA4')).toBe('northern kia')
    expect(normalizeProperty('Northern KIA GA4')).toBe('northern kia')
  })
})

describe('matchPropertiesToClients', () => {
  it('confidently matches a brand property to its location group', () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p1', propertyDisplayName: 'Northern KIA - GA4' }],
      CLIENTS
    )
    expect(out).toEqual([{ propertyId: 'p1', clientId: 'c-northern' }])
  })

  it("matches the group's own property", () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p2', propertyDisplayName: 'Northern Motor Group - GA4' }],
      CLIENTS
    )
    expect(out[0].clientId).toBe('c-northern')
  })

  it('returns null when no client location matches', () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p3', propertyDisplayName: 'South Morang Ssangyong' }],
      CLIENTS
    )
    expect(out[0].clientId).toBeNull()
  })

  it('matches an exact full-name client (no Motor Group suffix)', () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p4', propertyDisplayName: 'Pakenham Isuzu UTE - GA4' }],
      CLIENTS
    )
    expect(out[0].clientId).toBe('c-pak')
  })

  it('is case-insensitive', () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p5', propertyDisplayName: 'GEELONG ram - ga4' }],
      CLIENTS
    )
    expect(out[0].clientId).toBe('c-geelong')
  })

  it('prefers the longest unique key and returns null on a tie', () => {
    const tied = [
      { id: 'a', name: 'North Motor Group' },   // key "north"
      { id: 'b', name: 'North' }                // key "north" (same)
    ]
    const out = matchPropertiesToClients(
      [{ propertyId: 'p6', propertyDisplayName: 'North Shore Hyundai' }],
      tied
    )
    expect(out[0].clientId).toBeNull()
  })
})
