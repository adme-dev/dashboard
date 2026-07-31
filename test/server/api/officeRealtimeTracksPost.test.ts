import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: {
    params?: Record<string, string>
    body?: unknown
    cloudflare?: { env?: Record<string, unknown> }
  }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.context?.body ?? {}
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireOfficeRealtimeAccess = vi.fn()
const mockRequireOfficeRemoteTrackAccess = vi.fn()
const mockRequireOfficeRealtimeZone = vi.fn()
const mockAddRealtimeTracks = vi.fn()

vi.mock('~~/server/utils/officeRealtimeAccess', () => ({
  requireOfficeRealtimeAccess: (...args: unknown[]) => mockRequireOfficeRealtimeAccess(...args),
  requireOfficeRemoteTrackAccess: (...args: unknown[]) => mockRequireOfficeRemoteTrackAccess(...args),
  requireOfficeRealtimeZone: (...args: unknown[]) => mockRequireOfficeRealtimeZone(...args)
}))

vi.mock('~~/server/utils/officeRealtime', () => ({
  addRealtimeTracks: (...args: unknown[]) => mockAddRealtimeTracks(...args)
}))

const { default: handler } = await import(
  '../../../server/api/office/[officeId]/realtime/[sessionId]/tracks.post'
)

function fakeEvent(overrides: Partial<TestEvent> = {}) {
  return {
    context: {
      params: { officeId: 'office-1', sessionId: 'session-1' },
      body: {
        zone_id: '575d4c24-9032-400b-984b-9c9525e621b5',
        sessionDescription: { type: 'offer', sdp: 'v=0' },
        tracks: [{ location: 'local', mid: '0', trackName: 'camera', kind: 'video' }]
      },
      cloudflare: {
        env: {
          REALTIME_APP_ID: 'app-1',
          REALTIME_APP_SECRET: 'secret-1'
        }
      },
      ...overrides.context
    }
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/realtime/:sessionId/tracks', () => {
  beforeEach(() => {
    mockRequireOfficeRealtimeAccess.mockReset()
    mockRequireOfficeRemoteTrackAccess.mockReset()
    mockRequireOfficeRealtimeZone.mockReset()
    mockAddRealtimeTracks.mockReset()
    mockRequireOfficeRealtimeAccess.mockResolvedValue({
      officeId: 'office-1',
      sessionId: 'session-1',
      appId: 'app-1',
      appSecret: 'secret-1'
    })
    mockRequireOfficeRealtimeZone.mockResolvedValue({
      id: '575d4c24-9032-400b-984b-9c9525e621b5'
    })
    mockAddRealtimeTracks.mockResolvedValue({
      sessionDescription: { type: 'answer', sdp: 'v=0 answer' },
      tracks: [{ mid: '0', status: 'active' }]
    })
  })

  it('requires and strips an exact capability before pulling a remote track', async () => {
    const event = fakeEvent({
      context: {
        body: {
          zone_id: '575d4c24-9032-400b-984b-9c9525e621b5',
          tracks: [{
            location: 'remote',
            sessionId: 'publisher-session-1',
            trackName: 'camera-track-1',
            kind: 'video',
            capability: 'signed-track-capability'
          }]
        }
      }
    })

    await handler(event)

    expect(mockRequireOfficeRealtimeAccess).toHaveBeenCalledWith(
      expect.anything(),
      {
        scope: 'pull',
        zoneId: '575d4c24-9032-400b-984b-9c9525e621b5'
      }
    )
    expect(mockRequireOfficeRemoteTrackAccess).toHaveBeenCalledWith(
      expect.anything(),
      {
        officeId: 'office-1',
        zoneId: '575d4c24-9032-400b-984b-9c9525e621b5',
        publisherSessionId: 'publisher-session-1',
        trackName: 'camera-track-1',
        kind: 'video',
        capability: 'signed-track-capability'
      }
    )
    expect(mockAddRealtimeTracks).toHaveBeenCalledWith({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1',
      sessionDescription: undefined,
      tracks: [{
        location: 'remote',
        sessionId: 'publisher-session-1',
        trackName: 'camera-track-1',
        kind: 'video'
      }],
      autoDiscover: undefined
    })
  })

  it('does not call Cloudflare when a remote-track capability is denied', async () => {
    mockRequireOfficeRemoteTrackAccess.mockRejectedValueOnce(
      testGlobal.createError({
        statusCode: 403,
        statusMessage: 'Remote track capability scope mismatch'
      })
    )

    await expect(handler(fakeEvent({
      context: {
        body: {
          zone_id: '575d4c24-9032-400b-984b-9c9525e621b5',
          tracks: [{
            location: 'remote',
            sessionId: 'publisher-session-1',
            trackName: 'camera-track-1',
            kind: 'video',
            capability: 'substituted-track-capability'
          }]
        }
      }
    }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Remote track capability scope mismatch'
    })
    expect(mockAddRealtimeTracks).not.toHaveBeenCalled()
  })

  it('rejects mixed local and remote track operations', async () => {
    await expect(handler(fakeEvent({
      context: {
        body: {
          zone_id: '575d4c24-9032-400b-984b-9c9525e621b5',
          sessionDescription: { type: 'offer', sdp: 'v=0' },
          tracks: [
            { location: 'local', mid: '0', trackName: 'camera', kind: 'video' },
            {
              location: 'remote',
              sessionId: 'publisher-session-1',
              trackName: 'camera-track-1',
              kind: 'video',
              capability: 'signed-track-capability'
            }
          ]
        }
      }
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Local publishing and remote pulling must use separate requests'
    })
    expect(mockRequireOfficeRealtimeAccess).not.toHaveBeenCalled()
    expect(mockAddRealtimeTracks).not.toHaveBeenCalled()
  })

  it('proxies track negotiation with server-side Realtime credentials', async () => {
    const result = await handler(fakeEvent())

    expect(result).toEqual({
      sessionDescription: { type: 'answer', sdp: 'v=0 answer' },
      tracks: [{ mid: '0', status: 'active' }]
    })
    expect(mockAddRealtimeTracks).toHaveBeenCalledWith({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1',
      sessionDescription: { type: 'offer', sdp: 'v=0' },
      tracks: [{ location: 'local', mid: '0', trackName: 'camera', kind: 'video' }],
      autoDiscover: undefined
    })
    expect(mockRequireOfficeRealtimeAccess).toHaveBeenCalledWith(
      expect.anything(),
      {
        scope: 'publish',
        zoneId: '575d4c24-9032-400b-984b-9c9525e621b5'
      }
    )
  })

  it('does not call Cloudflare when media authorization is denied', async () => {
    mockRequireOfficeRealtimeAccess.mockRejectedValueOnce(
      testGlobal.createError({
        statusCode: 403,
        statusMessage: 'Office media grant scope mismatch'
      })
    )

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Office media grant scope mismatch'
    })
    expect(mockAddRealtimeTracks).not.toHaveBeenCalled()
  })
})
