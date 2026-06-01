import { describe, it, expect } from 'vitest'
import { nextLifecycle, deriveTags } from '~~/server/utils/crm/lifecycle'

describe('nextLifecycle', () => {
  it('sets the baseline stage when none is set yet', () => {
    expect(nextLifecycle('activity_logged', null)).toBe('lead')
    expect(nextLifecycle('opportunity_created', null)).toBe('prospect')
    expect(nextLifecycle('opportunity_won', undefined)).toBe('customer')
  })

  it('advances forward on positive events', () => {
    expect(nextLifecycle('opportunity_created', 'lead')).toBe('prospect')
    expect(nextLifecycle('opportunity_won', 'prospect')).toBe('customer')
    expect(nextLifecycle('opportunity_won', 'active')).toBe('customer')
  })

  it('never downgrades an already-advanced lifecycle', () => {
    expect(nextLifecycle('opportunity_created', 'customer')).toBe('customer')
    expect(nextLifecycle('activity_logged', 'prospect')).toBe('prospect')
    expect(nextLifecycle('opportunity_created', 'active')).toBe('active')
  })

  it('keeps an already-won customer on a repeat win', () => {
    expect(nextLifecycle('opportunity_won', 'customer')).toBe('customer')
  })

  it('revives lost/dormant contacts on a positive event', () => {
    expect(nextLifecycle('opportunity_won', 'lost')).toBe('customer')
    expect(nextLifecycle('activity_logged', 'dormant')).toBe('lead')
    expect(nextLifecycle('opportunity_created', 'lost')).toBe('prospect')
  })

  it('is a no-op for unknown events (e.g. opportunity_lost is not auto-applied)', () => {
    expect(nextLifecycle('opportunity_lost', 'prospect')).toBe('prospect')
    expect(nextLifecycle('whatever', 'lead')).toBe('lead')
    expect(nextLifecycle('opportunity_lost', null)).toBe(null)
  })

  it('leaves custom / unrecognised current stages untouched', () => {
    expect(nextLifecycle('opportunity_created', 'vip')).toBe('vip')
  })
})

describe('deriveTags', () => {
  it('adds the "won" tag on a win', () => {
    expect(deriveTags('opportunity_won', [])).toEqual(['won'])
  })

  it('does not duplicate an existing tag', () => {
    expect(deriveTags('opportunity_won', ['won', 'priority'])).toEqual(['won', 'priority'])
  })

  it('returns the current tags unchanged for events with no tag derivation', () => {
    const cur = ['priority']
    expect(deriveTags('opportunity_created', cur)).toEqual(['priority'])
    expect(deriveTags('activity_logged', cur)).toEqual(['priority'])
  })

  it('defaults to an empty tag list', () => {
    expect(deriveTags('opportunity_created')).toEqual([])
  })
})
