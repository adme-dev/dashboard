import { describe, expect, it } from 'vitest'
import { signOfficeJwt } from '~~/server/utils/officeJwt'
import * as realtimeAccess from '~~/server/utils/officeRealtimeAccess'
import * as workerJwt from '../../../workers/office-room/src/jwt'

const SECRET = 'worker-secret'
const { verifyOfficeJwt } = workerJwt
const { verifyOfficeMediaGrant } = realtimeAccess

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

  it('signs a participant session grant that the Pages proxy can verify', async () => {
    const sign = (workerJwt as Record<string, unknown>).signOfficeMediaGrant
    const token = typeof sign === 'function'
      ? await (sign as (claims: Record<string, unknown>, secret: string) => Promise<string>)({
          purpose: 'office-media',
          officeId: 'office-1',
          zoneId: 'zone-1',
          handle: 'client:guest-1',
          sessionId: 'session-1',
          isGuest: true,
          guestBadgeId: 'badge-1',
          scopes: ['state', 'publish', 'pull', 'renegotiate', 'close'],
          exp: Math.floor(Date.now() / 1000) + 60
        }, SECRET)
      : ''

    await expect(verifyOfficeMediaGrant(token, SECRET)).resolves.toMatchObject({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'client:guest-1',
      sessionId: 'session-1',
      isGuest: true,
      guestBadgeId: 'badge-1'
    })
  })

  it('signs a same-zone remote-track capability that the Pages proxy can verify', async () => {
    const sign = (workerJwt as Record<string, unknown>).signOfficeRemoteTrackGrant
    const verify = (realtimeAccess as Record<string, unknown>).verifyOfficeRemoteTrackGrant
    const token = typeof sign === 'function'
      ? await (sign as (claims: Record<string, unknown>, secret: string) => Promise<string>)({
          purpose: 'office-remote-track',
          officeId: 'office-1',
          zoneId: 'zone-1',
          publisherHandle: 'user:user-1',
          publisherSessionId: 'publisher-session-1',
          trackName: 'camera-track-1',
          kind: 'video',
          exp: Math.floor(Date.now() / 1000) + 60
        }, SECRET)
      : ''
    const claims = typeof verify === 'function'
      ? await (verify as (token: string, secret: string) => Promise<unknown>)(token, SECRET)
      : null

    expect(claims).toMatchObject({
      purpose: 'office-remote-track',
      officeId: 'office-1',
      zoneId: 'zone-1',
      publisherHandle: 'user:user-1',
      publisherSessionId: 'publisher-session-1',
      trackName: 'camera-track-1',
      kind: 'video'
    })
  })
})
