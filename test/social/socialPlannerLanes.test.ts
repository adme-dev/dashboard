import { describe, it, expect } from 'vitest'
import { deriveLane, needsAttention, LANES } from '../../app/utils/socialPlannerLanes'

const post = (over: Record<string, any> = {}) => ({
  status: 'draft', approval_requested_at: null, approved_at: null, ...over,
})

describe('deriveLane', () => {
  it('plain draft → draft', () => { expect(deriveLane(post())).toBe('draft') })
  it('approval requested, not yet approved → needs_approval', () => {
    expect(deriveLane(post({ approval_requested_at: '2026-06-24T00:00:00Z' }))).toBe('needs_approval')
  })
  it('approved post stays in scheduled lane', () => {
    expect(deriveLane(post({ status: 'approved', approval_requested_at: 'x', approved_at: 'y' }))).toBe('scheduled')
  })
  it('scheduled/publishing → scheduled', () => {
    expect(deriveLane(post({ status: 'scheduled' }))).toBe('scheduled')
    expect(deriveLane(post({ status: 'publishing' }))).toBe('scheduled')
  })
  it('published/partially_published → published', () => {
    expect(deriveLane(post({ status: 'published' }))).toBe('published')
    expect(deriveLane(post({ status: 'partially_published' }))).toBe('published')
  })
  it('failed/cancelled fall into scheduled lane (surfaced via attention)', () => {
    expect(deriveLane(post({ status: 'failed' }))).toBe('scheduled')
    expect(deriveLane(post({ status: 'cancelled' }))).toBe('scheduled')
  })
})

describe('needsAttention', () => {
  it('true for failed/cancelled, false otherwise', () => {
    expect(needsAttention({ status: 'failed' })).toBe(true)
    expect(needsAttention({ status: 'cancelled' })).toBe(true)
    expect(needsAttention({ status: 'scheduled' })).toBe(false)
  })
})

describe('LANES', () => {
  it('lists the four lanes in pipeline order', () => {
    expect(LANES.map(l => l.key)).toEqual(['draft', 'needs_approval', 'scheduled', 'published'])
  })
})
