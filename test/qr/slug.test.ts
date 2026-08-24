import { describe, it, expect } from 'vitest'
import { generateSlug, isValidSlug } from '../../shared/qr/slug'

describe('slug', () => {
  it('generates 7-char base58 slugs', () => {
    for (let i = 0; i < 200; i++) {
      const s = generateSlug()
      expect(s).toMatch(/^[1-9A-HJ-NP-Za-km-z]{7}$/)
    }
  })
  it('generates distinct slugs', () => {
    expect(new Set(Array.from({ length: 500 }, generateSlug)).size).toBe(500)
  })
  it('validates shape', () => {
    expect(isValidSlug('AbC1234')).toBe(true)
    expect(isValidSlug('AbC123')).toBe(false)
    expect(isValidSlug('AbC12340')).toBe(false)
    expect(isValidSlug('0OIl000')).toBe(false)
    expect(isValidSlug(null)).toBe(false)
  })
})
