import { describe, it, expect } from 'vitest'
import { resolveClientIp } from '../../../../server/utils/tracking/client-ip'

describe('resolveClientIp', () => {
  it('prefers cf-connecting-ip (the one CF actually sets in the Workers runtime)', () => {
    expect(resolveClientIp('1.2.3.4', '5.6.7.8')).toBe('1.2.3.4')
  })
  it('falls back to getRequestIP value when the cf header is absent', () => {
    expect(resolveClientIp(null, '5.6.7.8')).toBe('5.6.7.8')
    expect(resolveClientIp(undefined, '5.6.7.8')).toBe('5.6.7.8')
    expect(resolveClientIp('', '5.6.7.8')).toBe('5.6.7.8')
  })
  it('returns empty string when neither source is present', () => {
    expect(resolveClientIp(undefined, undefined)).toBe('')
    expect(resolveClientIp(null, '')).toBe('')
  })
  it('trims surrounding whitespace', () => {
    expect(resolveClientIp(' 1.2.3.4 ', null)).toBe('1.2.3.4')
  })
})
