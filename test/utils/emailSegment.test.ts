import { describe, it, expect } from 'vitest'
import {
  evaluateSegment,
  resolveSubscriberField,
  isValidSegment,
  type SegmentSubscriber
} from '~~/server/utils/email-marketing/segment'

const sub: SegmentSubscriber = {
  email: 'ada@acme.com',
  name: 'Ada Lovelace',
  status: 'enabled',
  attribs: { budget: 8000, plan: 'pro', city: 'London' }
}

describe('resolveSubscriberField', () => {
  it('resolves top-level fields', () => {
    expect(resolveSubscriberField(sub, 'email')).toBe('ada@acme.com')
    expect(resolveSubscriberField(sub, 'status')).toBe('enabled')
  })
  it('resolves attribs by bare key or attribs.<key>', () => {
    expect(resolveSubscriberField(sub, 'budget')).toBe(8000)
    expect(resolveSubscriberField(sub, 'attribs.plan')).toBe('pro')
  })
  it('returns undefined for missing fields', () => {
    expect(resolveSubscriberField(sub, 'nope')).toBeUndefined()
  })
})

describe('evaluateSegment', () => {
  it('matches everyone when segment is null or has no rules', () => {
    expect(evaluateSegment(sub, null)).toBe(true)
    expect(evaluateSegment(sub, { match: 'all', rules: [] })).toBe(true)
  })

  it('match=all requires every rule to pass (AND)', () => {
    const seg = { match: 'all' as const, rules: [
      { field: 'budget', op: 'gt' as const, value: 5000 },
      { field: 'status', op: 'eq' as const, value: 'enabled' }
    ] }
    expect(evaluateSegment(sub, seg)).toBe(true)
    expect(evaluateSegment({ ...sub, status: 'disabled' }, seg)).toBe(false)
    expect(evaluateSegment({ ...sub, attribs: { budget: 100 } }, seg)).toBe(false)
  })

  it('match=any requires at least one rule to pass (OR)', () => {
    const seg = { match: 'any' as const, rules: [
      { field: 'plan', op: 'eq' as const, value: 'enterprise' },
      { field: 'budget', op: 'gte' as const, value: 8000 }
    ] }
    expect(evaluateSegment(sub, seg)).toBe(true) // budget passes
    expect(evaluateSegment({ ...sub, attribs: { budget: 10, plan: 'free' } }, seg)).toBe(false)
  })

  it('supports contains / is_empty / is_not_empty / in', () => {
    expect(evaluateSegment(sub, { match: 'all', rules: [{ field: 'email', op: 'contains', value: 'acme' }] })).toBe(true)
    expect(evaluateSegment(sub, { match: 'all', rules: [{ field: 'city', op: 'is_not_empty' }] })).toBe(true)
    expect(evaluateSegment(sub, { match: 'all', rules: [{ field: 'missing', op: 'is_empty' }] })).toBe(true)
    expect(evaluateSegment(sub, { match: 'all', rules: [{ field: 'plan', op: 'in', value: ['pro', 'enterprise'] }] })).toBe(true)
    expect(evaluateSegment(sub, { match: 'all', rules: [{ field: 'plan', op: 'not_in', value: ['pro'] }] })).toBe(false)
  })

  it('treats an unknown operator as a non-match (fail safe)', () => {
    // @ts-expect-error — exercising the runtime guard for bad stored data
    expect(evaluateSegment(sub, { match: 'all', rules: [{ field: 'plan', op: 'wat', value: 'x' }] })).toBe(false)
  })
})

describe('isValidSegment', () => {
  it('accepts a well-formed segment', () => {
    expect(isValidSegment({ match: 'all', rules: [{ field: 'budget', op: 'gt', value: 1 }] })).toBe(true)
    expect(isValidSegment({ match: 'any', rules: [] })).toBe(true)
  })
  it('rejects malformed / foreign shapes (stored JSONB hygiene)', () => {
    expect(isValidSegment(null)).toBe(false)
    expect(isValidSegment({})).toBe(false)
    expect(isValidSegment({ match: 'xor', rules: [] })).toBe(false)
    expect(isValidSegment({ match: 'all', rules: 'nope' })).toBe(false)
    expect(isValidSegment({ match: 'all', rules: [{ field: 1, op: 'eq' }] })).toBe(false)
  })
})
