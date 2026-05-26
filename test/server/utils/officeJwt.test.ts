import { describe, it, expect } from 'vitest'
import {
  signOfficeJwt,
  verifyOfficeJwt,
  type OfficeJwtClaims
} from '~~/server/utils/officeJwt'

const SECRET = '6f' + '0'.repeat(62) // 64-char hex, deterministic for tests

const baseClaims = (overrides: Partial<OfficeJwtClaims> = {}): OfficeJwtClaims => ({
  handle: 'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Alice',
  avatarUrl: null,
  role: 'member',
  isGuest: false,
  officeId: 'office-1',
  exp: Math.floor(Date.now() / 1000) + 60,
  ...overrides
})

describe('officeJwt', () => {
  it('signs and verifies a valid token round-trip', async () => {
    const claims = baseClaims()
    const token = await signOfficeJwt(claims, SECRET)
    expect(token.split('.').length).toBe(3)
    const verified = await verifyOfficeJwt(token, SECRET)
    expect(verified).not.toBeNull()
    expect(verified?.handle).toBe(claims.handle)
    expect(verified?.officeId).toBe('office-1')
    expect(verified?.role).toBe('member')
  })

  it('preserves the optional allowed zone claim for guest room tokens', async () => {
    const token = await signOfficeJwt(baseClaims({
      handle: 'client:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      role: 'guest',
      isGuest: true,
      allowedZoneId: 'zone-1',
      guestBadgeId: 'badge-1',
      zoneCapacities: { 'zone-1': 4 }
    }), SECRET)

    const verified = await verifyOfficeJwt(token, SECRET)

    expect(verified?.allowedZoneId).toBe('zone-1')
    expect(verified?.guestBadgeId).toBe('badge-1')
    expect(verified?.zoneCapacities).toEqual({ 'zone-1': 4 })
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signOfficeJwt(baseClaims(), SECRET)
    expect(await verifyOfficeJwt(token, 'other-secret')).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signOfficeJwt(
      baseClaims({ exp: Math.floor(Date.now() / 1000) - 1 }),
      SECRET
    )
    expect(await verifyOfficeJwt(token, SECRET)).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const token = await signOfficeJwt(baseClaims(), SECRET)
    // Replace the payload segment with a forged one (different officeId)
    const forgedPayload = btoa(JSON.stringify({ ...baseClaims(), officeId: 'evil' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const [header, , sig] = token.split('.')
    const tampered = `${header}.${forgedPayload}.${sig}`
    expect(await verifyOfficeJwt(tampered, SECRET)).toBeNull()
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyOfficeJwt('not-a-jwt', SECRET)).toBeNull()
    expect(await verifyOfficeJwt('one.two', SECRET)).toBeNull()
    expect(await verifyOfficeJwt('', SECRET)).toBeNull()
  })
})
