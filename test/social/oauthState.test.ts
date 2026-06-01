import { describe, it, expect } from 'vitest'
import { signState, verifyState } from '~~/server/utils/socialOAuth/state'

const SECRET = 'test-secret'

describe('signState / verifyState', () => {
  it('round-trips the payload', () => {
    const token = signState({ clientId: 'c1', userId: 'u1', platform: 'meta', nonce: 'n1' }, SECRET)
    const data = verifyState<any>(token, SECRET, 600_000)
    expect(data?.clientId).toBe('c1')
    expect(data?.platform).toBe('meta')
  })
  it('rejects a tampered payload', () => {
    const token = signState({ clientId: 'c1' }, SECRET)
    const [body] = token.split('.')
    const forged = `${body}.deadbeef`
    expect(verifyState(forged, SECRET, 600_000)).toBeNull()
  })
  it('rejects a wrong secret', () => {
    const token = signState({ clientId: 'c1' }, SECRET)
    expect(verifyState(token, 'other', 600_000)).toBeNull()
  })
  it('rejects an expired token', () => {
    const token = signState({ clientId: 'c1', ts: Date.now() - 10_000 }, SECRET)
    expect(verifyState(token, SECRET, 5_000)).toBeNull()
  })
  it('stamps ts when absent and accepts a fresh token', () => {
    const token = signState({ clientId: 'c1' }, SECRET)
    expect(verifyState<any>(token, SECRET, 600_000)?.clientId).toBe('c1')
  })
  it('returns null on malformed input', () => {
    expect(verifyState('not-a-token', SECRET, 600_000)).toBeNull()
    expect(verifyState('', SECRET, 600_000)).toBeNull()
  })
})
