import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizePhone, phoneKey, normalizeName, diceCoefficient, similarityScore, candidatePairs } from '~~/server/utils/crm/dedupe'

describe('normalizers', () => {
  it('normalizeEmail lowercases + trims', () => {
    expect(normalizeEmail('  Bob@Example.COM ')).toBe('bob@example.com')
    expect(normalizeEmail(null)).toBe('')
  })
  it('normalizePhone strips to canonical digits', () => {
    expect(normalizePhone('+61 (412) 345-678')).toBe('61412345678')
    expect(normalizePhone('0412 345 678')).toBe('0412345678')
    expect(normalizePhone(undefined)).toBe('')
  })
  it('phoneKey reconciles trunk-0 vs +61 by trailing subscriber digits', () => {
    expect(phoneKey('0412 345 678')).toBe('412345678')
    expect(phoneKey('+61 412 345 678')).toBe('412345678')
    expect(phoneKey('0412 345 678')).toBe(phoneKey('+61412345678'))
  })
  it('normalizeName lowercases + collapses whitespace', () => {
    expect(normalizeName('  John   Smith ')).toBe('john smith')
  })
})

describe('diceCoefficient', () => {
  it('is 1 for identical strings and 0 for fully disjoint', () => {
    expect(diceCoefficient('acme', 'acme')).toBe(1)
    expect(diceCoefficient('acme', 'zzzz')).toBe(0)
  })
  it('is between 0 and 1 for partial overlap', () => {
    const s = diceCoefficient('acme corp', 'acme corporation')
    expect(s).toBeGreaterThan(0.4)
    expect(s).toBeLessThan(1)
  })
})

describe('similarityScore', () => {
  it('returns 1 when emails match (case-insensitive)', () => {
    expect(similarityScore({ id: '1', email: 'A@x.com', name: 'Al' }, { id: '2', email: 'a@x.com', name: 'Bob' })).toBe(1)
  })
  it('scores high when phones match even if names differ', () => {
    const s = similarityScore({ id: '1', phone: '0412345678', name: 'Al' }, { id: '2', phone: '+61 412 345 678', name: 'Bob' })
    expect(s).toBeGreaterThanOrEqual(0.8)
  })
  it('scores on name similarity when no email/phone match', () => {
    const s = similarityScore({ id: '1', name: 'Jon Smith' }, { id: '2', name: 'John Smith' })
    expect(s).toBeGreaterThan(0.5)
    expect(s).toBeLessThan(1)
  })
  it('is low for unrelated records', () => {
    expect(similarityScore({ id: '1', name: 'Acme Pty' }, { id: '2', name: 'Globex Inc' })).toBeLessThan(0.4)
  })
})

describe('candidatePairs', () => {
  const recs = [
    { id: 'a', email: 'bob@x.com', name: 'Bob Jones' },
    { id: 'b', email: 'BOB@x.com', name: 'Robert Jones' }, // same email → dup of a
    { id: 'c', phone: '0412345678', name: 'Jane Doe' },
    { id: 'd', phone: '+61412345678', name: 'Jane D' },     // same phone → dup of c
    { id: 'e', name: 'Zorblax Industries' },                // unique
  ]
  it('surfaces exact-email and exact-phone duplicates', () => {
    const pairs = candidatePairs(recs)
    const keys = pairs.map(p => [p.a_id, p.b_id].sort().join(''))
    expect(keys).toContain('ab')
    expect(keys).toContain('cd')
  })
  it('does not pair the unique record', () => {
    const pairs = candidatePairs(recs)
    expect(pairs.some(p => p.a_id === 'e' || p.b_id === 'e')).toBe(false)
  })
  it('returns each pair once, sorted by score desc', () => {
    const pairs = candidatePairs(recs)
    const keys = pairs.map(p => [p.a_id, p.b_id].sort().join(''))
    expect(new Set(keys).size).toBe(keys.length)
    for (let i = 1; i < pairs.length; i++) expect(pairs[i - 1].score).toBeGreaterThanOrEqual(pairs[i].score)
  })
})
