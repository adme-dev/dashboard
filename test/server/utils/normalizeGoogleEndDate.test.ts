import { describe, it, expect } from 'vitest'
import { normalizeGoogleEndDate } from '~~/server/utils/googleAdsClient'

describe('normalizeGoogleEndDate', () => {
  it('passes through a real end date', () => {
    expect(normalizeGoogleEndDate('2026-06-15')).toBe('2026-06-15')
  })
  it('treats the no-end sentinel (2037-12-30) as null', () => {
    expect(normalizeGoogleEndDate('2037-12-30')).toBeNull()
  })
  it('treats any 2037+ date as null', () => {
    expect(normalizeGoogleEndDate('2037-01-01')).toBeNull()
    expect(normalizeGoogleEndDate('2040-05-01')).toBeNull()
  })
  it('returns null for empty/missing', () => {
    expect(normalizeGoogleEndDate('')).toBeNull()
    expect(normalizeGoogleEndDate(undefined)).toBeNull()
    expect(normalizeGoogleEndDate(null)).toBeNull()
  })
})
