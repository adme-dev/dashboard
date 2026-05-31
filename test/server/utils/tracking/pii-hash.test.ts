import { describe, it, expect } from 'vitest'
import { hashForDest, hashUserDataForDest } from '../../../../server/utils/tracking/pii-hash'
import { normalizeEmailForDest } from '../../../../server/utils/tracking/normalize'

describe('normalizeEmailForDest', () => {
  it('strips gmail dots + alias for ga4 but not for meta', () => {
    expect(normalizeEmailForDest('John.Doe+ads@gmail.com', 'ga4')).toBe('johndoe@gmail.com')
    expect(normalizeEmailForDest('John.Doe+ads@gmail.com', 'meta')).toBe('john.doe+ads@gmail.com')
  })
})

describe('hashForDest', () => {
  it('produces a stable 64-char sha256 hex', async () => {
    const h = await hashForDest('johndoe@gmail.com')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
  it('returns empty string for falsy input', async () => {
    expect(await hashForDest('')).toBe('')
  })
})

describe('hashUserDataForDest', () => {
  it('only returns keys that had values', async () => {
    const out = await hashUserDataForDest({ email: 'a@b.com' }, 'meta')
    expect(out.em).toMatch(/^[0-9a-f]{64}$/)
    expect(out.ph).toBeUndefined()
  })
})
