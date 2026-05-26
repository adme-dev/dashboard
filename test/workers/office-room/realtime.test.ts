import { describe, expect, it, vi } from 'vitest'
import {
  addZoneRealtimeTracks,
  buildZoneCorrelationId,
  closeZoneRealtimeTracks,
  createZoneRealtimeSession
} from '../../../workers/office-room/src/realtime'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' }
  })
}

const env = {
  REALTIME_APP_ID: 'app-1',
  REALTIME_APP_SECRET: 'secret-1'
}

describe('OfficeRoom realtime helper', () => {
  it('builds stable zone correlation ids', () => {
    expect(buildZoneCorrelationId({
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:u1'
    })).toBe('office:office-1:zone:zone-1:actor:user:u1')
  })

  it('creates zone sessions with app secret auth and correlation id', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ sessionId: 'session-1' }, { status: 201 }))

    const result = await createZoneRealtimeSession({
      env,
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:u1',
      fetcher
    })

    expect(result).toEqual({ sessionId: 'session-1' })
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toBe('https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/new?correlationId=office%3Aoffice-1%3Azone%3Azone-1%3Aactor%3Auser%3Au1')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Authorization': 'Bearer secret-1',
        'Content-Type': 'application/json'
      },
      body: '{}'
    })
  })

  it('adds tracks to a Realtime session', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      requiresImmediateRenegotiation: false,
      tracks: [{ location: 'local', mid: '0', trackName: 'camera-1' }]
    }))

    await addZoneRealtimeTracks({
      env,
      sessionId: 'session-1',
      fetcher,
      sessionDescription: { type: 'offer', sdp: 'offer-sdp' },
      tracks: [{ location: 'local', mid: '0', trackName: 'camera-1', kind: 'video' }]
    })

    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toBe('https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/session-1/tracks/new')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      sessionDescription: { type: 'offer', sdp: 'offer-sdp' },
      tracks: [{ location: 'local', mid: '0', trackName: 'camera-1', kind: 'video' }]
    })
  })

  it('closes tracks for cleanup', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ tracks: [{ mid: '0' }] }))

    await closeZoneRealtimeTracks({
      env,
      sessionId: 'session-1',
      fetcher,
      tracks: [{ mid: '0' }],
      force: true
    })

    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toBe('https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/session-1/tracks/close')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      tracks: [{ mid: '0' }],
      force: true
    })
  })

  it('throws if Realtime secrets are missing', async () => {
    await expect(createZoneRealtimeSession({
      env: {},
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:u1'
    })).rejects.toThrow(/REALTIME_APP_ID/)
  })

  it('throws readable API errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      errorCode: 'quota_exceeded',
      errorDescription: 'No sessions available'
    }, { status: 429 }))

    await expect(createZoneRealtimeSession({
      env,
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:u1',
      fetcher
    })).rejects.toThrow(/429.*No sessions available/)
  })
})
