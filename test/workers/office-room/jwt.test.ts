import { describe, expect, it } from 'vitest'
import { signOfficeJwt } from '~~/server/utils/officeJwt'
import { verifyOfficeJwt } from '../../../workers/office-room/src/jwt'

const SECRET = 'worker-secret'

describe('office-room worker JWT verifier', () => {
  it('preserves staff token identity and sanitizes zone capacities', async () => {
    const token = await signOfficeJwt({
      handle: 'user:user-1',
      name: 'Paul',
      avatarUrl: '',
      role: 'admin',
      isGuest: false,
      officeId: 'office-1',
      zoneCapacities: { 'zone-1': 4.8, 'zone-2': 0, 'zone-3': Number.NaN },
      exp: Math.floor(Date.now() / 1000) + 60
    }, SECRET)

    const claims = await verifyOfficeJwt(token, SECRET)

    expect(claims).toMatchObject({
      handle: 'user:user-1',
      name: 'Paul',
      avatarUrl: null,
      role: 'admin',
      isGuest: false,
      officeId: 'office-1',
      zoneCapacities: { 'zone-1': 4 }
    })
  })

  it('preserves allowedZoneId from server-signed guest tokens', async () => {
    const token = await signOfficeJwt({
      handle: 'client:request-1',
      name: 'Guest',
      avatarUrl: null,
      role: 'guest',
      isGuest: true,
      officeId: 'office-1',
      allowedZoneId: 'zone-1',
      guestBadgeId: 'badge-1',
      zoneCapacities: { 'zone-1': 4 },
      exp: Math.floor(Date.now() / 1000) + 60
    }, SECRET)

    const claims = await verifyOfficeJwt(token, SECRET)

    expect(claims).toMatchObject({
      handle: 'client:request-1',
      role: 'guest',
      isGuest: true,
      officeId: 'office-1',
      allowedZoneId: 'zone-1',
      guestBadgeId: 'badge-1',
      zoneCapacities: { 'zone-1': 4 }
    })
  })

  it('rejects expired tokens', async () => {
    const token = await signOfficeJwt({
      handle: 'user:user-1',
      name: 'Paul',
      avatarUrl: null,
      role: 'member',
      isGuest: false,
      officeId: 'office-1',
      exp: Math.floor(Date.now() / 1000) - 1
    }, SECRET)

    await expect(verifyOfficeJwt(token, SECRET)).resolves.toBeNull()
  })

  it('rejects malformed signed guest claims', async () => {
    const token = await signOfficeJwt({
      handle: 'client:request-1',
      name: 'Guest',
      avatarUrl: null,
      role: 'guest',
      isGuest: true,
      officeId: 'office-1',
      allowedZoneId: null,
      guestBadgeId: 'badge-1',
      exp: Math.floor(Date.now() / 1000) + 60
    }, SECRET)

    await expect(verifyOfficeJwt(token, SECRET)).resolves.toBeNull()
  })

  it('rejects staff tokens signed with the guest role', async () => {
    const token = await signOfficeJwt({
      handle: 'user:user-1',
      name: 'Paul',
      avatarUrl: null,
      role: 'guest',
      isGuest: false,
      officeId: 'office-1',
      exp: Math.floor(Date.now() / 1000) + 60
    }, SECRET)

    await expect(verifyOfficeJwt(token, SECRET)).resolves.toBeNull()
  })
})
