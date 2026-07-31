import { describe, expect, it, vi } from 'vitest'
import {
  addRealtimeTracks,
  closeRealtimeTracks,
  createRealtimeSession,
  getRealtimeSessionState,
  renegotiateRealtimeSession
} from '~~/server/utils/officeRealtime'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' }
  })
}

describe('officeRealtime', () => {
  it('creates Cloudflare Realtime sessions with bearer auth and correlation id', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ sessionId: 'session-1' }, { status: 201 }))

    const result = await createRealtimeSession({
      appId: 'app-1',
      appSecret: 'secret-1',
      correlationId: 'office:o1:zone:z1:user:u1',
      fetcher
    })

    expect(result).toEqual({ sessionId: 'session-1' })
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toBe('https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/new?correlationId=office%3Ao1%3Azone%3Az1%3Auser%3Au1')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Authorization': 'Bearer secret-1'
      },
      body: undefined
    })
    expect((init as RequestInit).headers).not.toHaveProperty('Content-Type')
  })

  it('adds local or remote tracks to an existing session', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      requiresImmediateRenegotiation: false,
      tracks: [{ location: 'local', mid: '0', trackName: 'mic-1' }],
      sessionDescription: { type: 'answer', sdp: 'answer-sdp' }
    }))

    const result = await addRealtimeTracks({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1',
      fetcher,
      sessionDescription: { type: 'offer', sdp: 'offer-sdp' },
      tracks: [{ location: 'local', mid: '0', trackName: 'mic-1', kind: 'audio' }]
    })

    expect(result.tracks?.[0]).toMatchObject({ trackName: 'mic-1' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toBe('https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/session-1/tracks/new')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      sessionDescription: { type: 'offer', sdp: 'offer-sdp' },
      tracks: [{ location: 'local', mid: '0', trackName: 'mic-1', kind: 'audio' }]
    })
  })

  it('renegotiates sessions with an answer SDP', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({}))

    await renegotiateRealtimeSession({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1',
      fetcher,
      sessionDescription: { type: 'answer', sdp: 'answer-sdp' }
    })

    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toBe('https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/session-1/renegotiate')
    expect(init).toMatchObject({ method: 'PUT' })
  })

  it('closes tracks with force cleanup support', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      requiresImmediateRenegotiation: false,
      tracks: [{ mid: '0' }]
    }))

    await closeRealtimeTracks({
      appId: 'app-1',
      appSecret: 'secret-1',
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

  it('gets session state', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      tracks: [{ location: 'local', mid: '0', trackName: 'mic-1', status: 'active' }]
    }))

    const result = await getRealtimeSessionState({
      appId: 'app-1',
      appSecret: 'secret-1',
      sessionId: 'session-1',
      fetcher
    })

    expect(result.tracks?.[0]).toMatchObject({ status: 'active' })
    const [, init] = fetcher.mock.calls[0]!
    expect(init).toMatchObject({ method: 'GET' })
  })

  it('throws readable errors for non-2xx and Realtime error payloads', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      errorCode: 'quota_exceeded',
      errorDescription: 'No sessions available'
    }, { status: 429 }))

    await expect(createRealtimeSession({
      appId: 'app-1',
      appSecret: 'secret-1',
      fetcher
    })).rejects.toThrow(/429.*No sessions available/)
  })
})
