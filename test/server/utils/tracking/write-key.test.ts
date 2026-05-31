import { describe, it, expect } from 'vitest'
import { generateWriteKey } from '../../../../server/utils/tracking/write-key'

describe('generateWriteKey', () => {
  it('has the xf_ prefix and is URL-safe', () => {
    const k = generateWriteKey()
    expect(k).toMatch(/^xf_[A-Za-z0-9_-]{24,}$/)
  })
  it('is unique across calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateWriteKey()))
    expect(set.size).toBe(100)
  })
})
