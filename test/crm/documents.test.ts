import { describe, it, expect } from 'vitest'
import { expiryStatus, isExpired } from '~~/server/utils/crm/documents'

const NOW = Date.parse('2026-06-01T00:00:00Z')
const days = (n: number) => new Date(NOW + n * 86400_000).toISOString()

describe('expiryStatus', () => {
  it('none when no expiry or unparseable', () => {
    expect(expiryStatus(null, NOW)).toBe('none')
    expect(expiryStatus(undefined, NOW)).toBe('none')
    expect(expiryStatus('not-a-date', NOW)).toBe('none')
  })
  it('expired when at or before now', () => {
    expect(expiryStatus(days(-1), NOW)).toBe('expired')
    expect(expiryStatus(new Date(NOW).toISOString(), NOW)).toBe('expired')
  })
  it('expiring within the window, active beyond it', () => {
    expect(expiryStatus(days(3), NOW)).toBe('expiring')
    expect(expiryStatus(days(7), NOW)).toBe('expiring')
    expect(expiryStatus(days(30), NOW)).toBe('active')
  })
  it('isExpired is the boolean of the expired state', () => {
    expect(isExpired(days(-1), NOW)).toBe(true)
    expect(isExpired(days(1), NOW)).toBe(false)
    expect(isExpired(null, NOW)).toBe(false)
  })
})
