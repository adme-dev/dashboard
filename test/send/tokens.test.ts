import { describe, expect, it } from 'vitest'
import {
  createSendToken,
  hashSendToken,
  isSendTokenHash,
  sendTokenMatchesHash
} from '../../server/utils/send/tokens'

describe('Send opaque tokens', () => {
  it('generates 256-bit bearer material and stores only a SHA-256 digest', () => {
    const token = createSendToken()
    const rawBytes = Buffer.from(token.raw, 'base64url')

    expect(rawBytes).toHaveLength(32)
    expect(token.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(token.hash).toBe(hashSendToken(token.raw))
    expect(token.hash).not.toContain(token.raw)
  })

  it('generates independent tokens and verifies only the matching digest', () => {
    const first = createSendToken()
    const second = createSendToken()

    expect(first.raw).not.toBe(second.raw)
    expect(first.hash).not.toBe(second.hash)
    expect(sendTokenMatchesHash(first.raw, first.hash)).toBe(true)
    expect(sendTokenMatchesHash(first.raw, second.hash)).toBe(false)
  })

  it('rejects malformed or empty token material without throwing', () => {
    expect(isSendTokenHash('a'.repeat(64))).toBe(true)
    expect(isSendTokenHash('A'.repeat(64))).toBe(false)
    expect(isSendTokenHash('short')).toBe(false)
    expect(sendTokenMatchesHash('', 'a'.repeat(64))).toBe(false)
    expect(sendTokenMatchesHash('token', 'not-a-hash')).toBe(false)
  })
})
