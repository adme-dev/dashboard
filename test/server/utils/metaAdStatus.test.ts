import { describe, it, expect } from 'vitest'
import { mapMetaEffectiveStatus, NON_TERMINAL_STATUSES } from '~~/server/utils/metaAdStatus'

describe('mapMetaEffectiveStatus', () => {
  it('maps ACTIVE to active', () => {
    expect(mapMetaEffectiveStatus('ACTIVE')).toBe('active')
  })

  it('maps all pause variants to paused', () => {
    expect(mapMetaEffectiveStatus('PAUSED')).toBe('paused')
    expect(mapMetaEffectiveStatus('ADSET_PAUSED')).toBe('paused')
    expect(mapMetaEffectiveStatus('CAMPAIGN_PAUSED')).toBe('paused')
  })

  it('maps in-review variants to pending_review', () => {
    expect(mapMetaEffectiveStatus('PENDING_REVIEW')).toBe('pending_review')
    expect(mapMetaEffectiveStatus('IN_PROCESS')).toBe('pending_review')
    expect(mapMetaEffectiveStatus('PREAPPROVED')).toBe('pending_review')
    expect(mapMetaEffectiveStatus('PENDING_BILLING_INFO')).toBe('pending_review')
  })

  it('maps disapproval variants to rejected', () => {
    expect(mapMetaEffectiveStatus('DISAPPROVED')).toBe('rejected')
    expect(mapMetaEffectiveStatus('WITH_ISSUES')).toBe('rejected')
  })

  it('maps removal variants to removed', () => {
    expect(mapMetaEffectiveStatus('DELETED')).toBe('removed')
    expect(mapMetaEffectiveStatus('ARCHIVED')).toBe('removed')
  })

  it('defaults unknown/empty/null to pending_review so the row keeps re-checking', () => {
    expect(mapMetaEffectiveStatus('SOMETHING_NEW')).toBe('pending_review')
    expect(mapMetaEffectiveStatus('')).toBe('pending_review')
    expect(mapMetaEffectiveStatus(null)).toBe('pending_review')
    expect(mapMetaEffectiveStatus(undefined)).toBe('pending_review')
  })

  it('is case-insensitive on the incoming Meta value', () => {
    expect(mapMetaEffectiveStatus('active')).toBe('active')
    expect(mapMetaEffectiveStatus('Disapproved')).toBe('rejected')
  })

  it('treats error and removed as terminal (excluded from re-check set)', () => {
    expect(NON_TERMINAL_STATUSES).not.toContain('error')
    expect(NON_TERMINAL_STATUSES).not.toContain('removed')
    expect(NON_TERMINAL_STATUSES).toContain('pending_review')
    expect(NON_TERMINAL_STATUSES).toContain('active')
    expect(NON_TERMINAL_STATUSES).toContain('paused')
    expect(NON_TERMINAL_STATUSES).toContain('rejected')
  })
})
