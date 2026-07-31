import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signTestOfficeMediaGrant as signTestGrant } from '../../utils/officeMediaGrant'

type TestEvent = {
  context?: {
    params?: Record<string, string>
    headers?: Record<string, string>
    cloudflare?: { env?: Record<string, unknown> }
  }
}

const testGlobal = globalThis as typeof globalThis & {
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getHeader: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.getHeader = (event, key) => event.context?.headers?.[key.toLowerCase()]
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const realtimeAccessModule = await import('~~/server/utils/officeRealtimeAccess')
const {
  requireOfficeRealtimeAccess,
  requireOfficeRealtimeZone
} = realtimeAccessModule

async function verifyMediaGrant(token: string, secret = 'office-secret') {
  const verify = (realtimeAccessModule as Record<string, unknown>).verifyOfficeMediaGrant
  if (typeof verify !== 'function') return undefined
  return await (verify as (token: string, secret: string) => Promise<unknown>)(token, secret)
}

async function requireGrantAccess(
  event: TestEvent,
  options: { scope: string, zoneId: string }
) {
  return await (requireOfficeRealtimeAccess as unknown as (
    event: TestEvent,
    options: { scope: string, zoneId: string }
  ) => Promise<Record<string, unknown>>)(event, options)
}

async function requireRemoteTrackAccess(
  event: TestEvent,
  input: Record<string, unknown>
) {
  const requireAccess = (realtimeAccessModule as Record<string, unknown>)
    .requireOfficeRemoteTrackAccess
  if (typeof requireAccess !== 'function') return undefined
  return await (requireAccess as (
    event: TestEvent,
    input: Record<string, unknown>
  ) => Promise<unknown>)(event, input)
}

function fakeEvent(overrides: Partial<TestEvent> = {}) {
  return {
    context: {
      params: { officeId: 'office-1', sessionId: 'session-1' },
      headers: {},
      cloudflare: {
        env: {
          OFFICE_SYNC_SECRET: 'office-secret',
          OFFICE_GUEST_REALTIME_MEDIA_ENABLED: 'true',
          OFFICE_GUEST_REALTIME_PILOT_OFFICE_IDS: 'office-1',
          REALTIME_APP_ID: 'app-1',
          REALTIME_APP_SECRET: 'secret-1'
        }
      },
      ...overrides.context
    }
  } satisfies TestEvent
}

describe('officeRealtimeAccess', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({ id: 'member-1', role: 'member' })
  })

  it('returns scoped Realtime credentials for the staff actor bound to the grant', async () => {
    const token = await signTestGrant({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:user-1',
      sessionId: 'session-1',
      isGuest: false,
      guestBadgeId: null,
      scopes: ['state'],
      exp: Math.floor(Date.now() / 1000) + 60
    })
    const result = await requireGrantAccess(fakeEvent({
      context: {
        headers: { authorization: `Bearer ${token}` }
      }
    }), {
      scope: 'state',
      zoneId: 'zone-1'
    })

    expect(result).toMatchObject({
      officeId: 'office-1',
      sessionId: 'session-1',
      appId: 'app-1',
      appSecret: 'secret-1',
      grant: {
        handle: 'user:user-1',
        zoneId: 'zone-1',
        scopes: ['state']
      },
      membership: { id: 'member-1', role: 'member' }
    })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('FROM office_members'),
      ['office-1', 'user-1']
    )
  })

  it('verifies a valid session-bound Office media grant', async () => {
    const token = await signTestGrant({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'client:guest-1',
      sessionId: 'session-1',
      isGuest: true,
      guestBadgeId: 'badge-1',
      scopes: ['state', 'publish', 'pull', 'renegotiate', 'close'],
      exp: Math.floor(Date.now() / 1000) + 60
    })

    await expect(verifyMediaGrant(token)).resolves.toMatchObject({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'client:guest-1',
      sessionId: 'session-1',
      isGuest: true,
      guestBadgeId: 'badge-1'
    })
  })

  it('rejects expired, wrong-purpose, and structurally invalid media grants', async () => {
    const base = {
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:user-1',
      sessionId: 'session-1',
      isGuest: false,
      guestBadgeId: null,
      scopes: ['state', 'publish'],
      exp: Math.floor(Date.now() / 1000) + 60
    }

    const expired = await signTestGrant({
      ...base,
      exp: Math.floor(Date.now() / 1000) - 1
    })
    const wrongPurpose = await signTestGrant({
      ...base,
      purpose: 'office-ws'
    })
    const invalidActor = await signTestGrant({
      ...base,
      handle: 'attacker'
    })
    const invalidScope = await signTestGrant({
      ...base,
      scopes: ['state', 'admin']
    })

    await expect(verifyMediaGrant(expired)).resolves.toBeNull()
    await expect(verifyMediaGrant(wrongPurpose)).resolves.toBeNull()
    await expect(verifyMediaGrant(invalidActor)).resolves.toBeNull()
    await expect(verifyMediaGrant(invalidScope)).resolves.toBeNull()
  })

  it('requires a bearer media grant before authorizing a Realtime session', async () => {
    await expect(requireGrantAccess(fakeEvent(), {
      scope: 'state',
      zoneId: 'zone-1'
    })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Office media grant required'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('rejects unscoped callers instead of falling back to cookie authorization', async () => {
    await expect(requireOfficeRealtimeAccess(fakeEvent() as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Office media operation scope required'
    })
    expect(mockRequireAuth).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('rejects grants bound to a different office, zone, session, or operation', async () => {
    const base = {
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:user-1',
      sessionId: 'session-1',
      isGuest: false,
      guestBadgeId: null,
      scopes: ['publish'],
      exp: Math.floor(Date.now() / 1000) + 60
    }
    const cases = [
      { claims: { ...base, officeId: 'office-2' }, scope: 'publish', zoneId: 'zone-1' },
      { claims: { ...base, zoneId: 'zone-2' }, scope: 'publish', zoneId: 'zone-1' },
      { claims: { ...base, sessionId: 'session-2' }, scope: 'publish', zoneId: 'zone-1' },
      { claims: base, scope: 'close', zoneId: 'zone-1' }
    ]

    for (const testCase of cases) {
      const token = await signTestGrant(testCase.claims)
      await expect(requireGrantAccess(fakeEvent({
        context: {
          headers: { authorization: `Bearer ${token}` }
        }
      }), {
        scope: testCase.scope,
        zoneId: testCase.zoneId
      })).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Office media grant scope mismatch'
      })
    }
  })

  it('authorizes an active guest badge bound to the same Office room', async () => {
    const token = await signTestGrant({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'client:guest-1',
      sessionId: 'session-1',
      isGuest: true,
      guestBadgeId: 'badge-1',
      scopes: ['publish'],
      exp: Math.floor(Date.now() / 1000) + 60
    })
    mockQueryOne.mockResolvedValueOnce({
      id: 'badge-1',
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      allowed_zone_id: 'zone-1'
    })

    const result = await requireGrantAccess(fakeEvent({
      context: {
        headers: { authorization: `Bearer ${token}` }
      }
    }), {
      scope: 'publish',
      zoneId: 'zone-1'
    })

    expect(result).toMatchObject({
      guestBadge: {
        id: 'badge-1',
        status: 'active',
        allowed_zone_id: 'zone-1'
      },
      grant: {
        handle: 'client:guest-1',
        guestBadgeId: 'badge-1'
      }
    })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('FROM office_guest_badges'),
      ['office-1', 'badge-1']
    )
    expect(mockRequireAuth).not.toHaveBeenCalled()
  })

  it('rejects missing, revoked, expired, and wrong-room guest badges', async () => {
    const token = await signTestGrant({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'client:guest-1',
      sessionId: 'session-1',
      isGuest: true,
      guestBadgeId: 'badge-1',
      scopes: ['publish'],
      exp: Math.floor(Date.now() / 1000) + 60
    })
    const invalidBadges = [
      null,
      {
        id: 'badge-1',
        status: 'revoked',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        allowed_zone_id: 'zone-1'
      },
      {
        id: 'badge-1',
        status: 'active',
        expires_at: new Date(Date.now() - 1_000).toISOString(),
        allowed_zone_id: 'zone-1'
      },
      {
        id: 'badge-1',
        status: 'active',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        allowed_zone_id: 'zone-2'
      }
    ]

    for (const badge of invalidBadges) {
      mockQueryOne.mockResolvedValueOnce(badge)
      await expect(requireGrantAccess(fakeEvent({
        context: {
          headers: { authorization: `Bearer ${token}` }
        }
      }), {
        scope: 'publish',
        zoneId: 'zone-1'
      })).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Guest media access is no longer active'
      })
    }
  })

  it('fails closed for guests when the rollout switch or Office pilot is absent', async () => {
    const token = await signTestGrant({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'client:guest-1',
      sessionId: 'session-1',
      isGuest: true,
      guestBadgeId: 'badge-1',
      scopes: ['publish'],
      exp: Math.floor(Date.now() / 1000) + 60
    })
    const activeBadge = {
      id: 'badge-1',
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      allowed_zone_id: 'zone-1'
    }
    const envCases = [
      {
        OFFICE_SYNC_SECRET: 'office-secret',
        REALTIME_APP_ID: 'app-1',
        REALTIME_APP_SECRET: 'secret-1'
      },
      {
        OFFICE_SYNC_SECRET: 'office-secret',
        OFFICE_GUEST_REALTIME_MEDIA_ENABLED: 'true',
        OFFICE_GUEST_REALTIME_PILOT_OFFICE_IDS: 'office-2',
        REALTIME_APP_ID: 'app-1',
        REALTIME_APP_SECRET: 'secret-1'
      }
    ]

    for (const env of envCases) {
      mockQueryOne.mockResolvedValueOnce(activeBadge)
      await expect(requireGrantAccess(fakeEvent({
        context: {
          headers: { authorization: `Bearer ${token}` },
          cloudflare: { env }
        }
      }), {
        scope: 'publish',
        zoneId: 'zone-1'
      })).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Guest Realtime media is not enabled'
      })
    }
  })

  it('accepts a signed remote-track capability bound to the publisher and room', async () => {
    const sign = (await import('../../../workers/office-room/src/jwt'))
      .signOfficeRemoteTrackGrant
    const capability = await sign({
      purpose: 'office-remote-track',
      officeId: 'office-1',
      zoneId: 'zone-1',
      publisherHandle: 'user:publisher-1',
      publisherSessionId: 'publisher-session-1',
      trackName: 'camera-track-1',
      kind: 'video',
      exp: Math.floor(Date.now() / 1000) + 60
    }, 'office-secret')

    await expect(requireRemoteTrackAccess(fakeEvent(), {
      officeId: 'office-1',
      zoneId: 'zone-1',
      publisherSessionId: 'publisher-session-1',
      trackName: 'camera-track-1',
      kind: 'video',
      capability
    })).resolves.toMatchObject({
      publisherHandle: 'user:publisher-1',
      publisherSessionId: 'publisher-session-1',
      trackName: 'camera-track-1'
    })
  })

  it('rejects substituted remote-track capability fields', async () => {
    const sign = (await import('../../../workers/office-room/src/jwt'))
      .signOfficeRemoteTrackGrant
    const capability = await sign({
      purpose: 'office-remote-track',
      officeId: 'office-1',
      zoneId: 'zone-1',
      publisherHandle: 'user:publisher-1',
      publisherSessionId: 'publisher-session-1',
      trackName: 'camera-track-1',
      kind: 'video',
      exp: Math.floor(Date.now() / 1000) + 60
    }, 'office-secret')
    const base = {
      officeId: 'office-1',
      zoneId: 'zone-1',
      publisherSessionId: 'publisher-session-1',
      trackName: 'camera-track-1',
      kind: 'video',
      capability
    }
    const substitutions = [
      { ...base, officeId: 'office-2' },
      { ...base, zoneId: 'zone-2' },
      { ...base, publisherSessionId: 'publisher-session-2' },
      { ...base, trackName: 'screen-track-1' },
      { ...base, kind: 'audio' }
    ]

    for (const input of substitutions) {
      await expect(requireRemoteTrackAccess(fakeEvent(), input)).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Remote track capability scope mismatch'
      })
    }
  })

  it('rejects missing route params', async () => {
    await expect(requireOfficeRealtimeAccess(fakeEvent({
      context: {
        params: { sessionId: 'session-1' }
      }
    }) as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'officeId required'
    })

    await expect(requireOfficeRealtimeAccess(fakeEvent({
      context: {
        params: { officeId: 'office-1' }
      }
    }) as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'sessionId required'
    })
  })

  it('rejects non-members before returning credentials', async () => {
    const token = await signTestGrant({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:user-1',
      sessionId: 'session-1',
      isGuest: false,
      guestBadgeId: null,
      scopes: ['state'],
      exp: Math.floor(Date.now() / 1000) + 60
    })
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(requireGrantAccess(fakeEvent({
      context: {
        headers: { authorization: `Bearer ${token}` }
      }
    }), {
      scope: 'state',
      zoneId: 'zone-1'
    })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
  })

  it('rejects missing Realtime credentials', async () => {
    const token = await signTestGrant({
      purpose: 'office-media',
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:user-1',
      sessionId: 'session-1',
      isGuest: false,
      guestBadgeId: null,
      scopes: ['state'],
      exp: Math.floor(Date.now() / 1000) + 60
    })

    await expect(requireGrantAccess(fakeEvent({
      context: {
        headers: { authorization: `Bearer ${token}` },
        cloudflare: {
          env: {
            OFFICE_SYNC_SECRET: 'office-secret'
          }
        }
      }
    }), {
      scope: 'state',
      zoneId: 'zone-1'
    })).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Realtime media is not configured'
    })
  })

  it('validates non-desk Realtime zones within the office', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'zone-1' })

    await expect(requireOfficeRealtimeZone('office-1', 'zone-1')).resolves.toEqual({ id: 'zone-1' })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('zone_type <>'),
      ['zone-1', 'office-1']
    )
  })

  it('rejects unknown or desk-only Realtime zones', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(requireOfficeRealtimeZone('office-1', 'desk-1')).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting room not found'
    })
  })
})
