import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, watch } from 'vue'
import type { OfficeMediaSession, OfficeRemoteTrackCapability } from '~~/app/types/office'

class FakePeerConnection {
  iceGatheringState = 'complete'
  connectionState = 'connected'
  localDescription: RTCSessionDescriptionInit | null = null
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  private transceivers: Array<{ mid: string, sender: { track: MediaStreamTrack | null } }> = []

  addTrack(track: MediaStreamTrack) {
    this.transceivers.push({
      mid: String(this.transceivers.length),
      sender: { track }
    })
  }

  getTransceivers() {
    return this.transceivers
  }

  async createOffer() {
    return { type: 'offer' as const, sdp: 'local-offer' }
  }

  async createAnswer() {
    return { type: 'answer' as const, sdp: 'local-answer' }
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description
  }

  async setRemoteDescription() {}
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

function fakeTrack(id: string, kind: 'audio' | 'video') {
  return {
    id,
    kind,
    readyState: 'live',
    addEventListener: vi.fn()
  } as unknown as MediaStreamTrack
}

function fakeStream(tracks: MediaStreamTrack[]) {
  return {
    id: 'local-stream',
    getTracks: () => tracks
  } as unknown as MediaStream
}

function mediaSession(): OfficeMediaSession {
  return {
    provider: 'cloudflare-realtime',
    sessionId: 'subscriber-session-1',
    correlationId: 'office:office-1:zone:zone-1:actor:user:subscriber-1',
    grant: 'signed-media-grant',
    grantExpiresAt: Date.now() + 60_000,
    createdAt: Date.now()
  }
}

function remoteCapability(): OfficeRemoteTrackCapability {
  return {
    publisherHandle: 'user:publisher-1',
    publisherSessionId: 'publisher-session-1',
    trackName: 'camera-track-1',
    kind: 'video',
    capability: 'signed-track-capability',
    expiresAt: Date.now() + 60_000
  }
}

describe('useOfficeRealtime', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    })
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('onBeforeUnmount', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('publishes local tracks, announces returned names, and pulls capability-authorized remote tracks', async () => {
    const requests: Array<{ request: string, options?: Record<string, unknown> }> = []
    vi.stubGlobal('$fetch', vi.fn(async (request: string, options?: Record<string, unknown>) => {
      requests.push({ request, options })
      const body = options?.body as { tracks?: Array<{ location: string }> } | undefined
      if (request.endsWith('/tracks') && body?.tracks?.[0]?.location === 'local') {
        return {
          sessionDescription: { type: 'answer', sdp: 'remote-answer' },
          tracks: [{ mid: '0', trackName: 'assigned-microphone-track', kind: 'audio', status: 'active' }]
        }
      }
      if (request.endsWith('/tracks') && body?.tracks?.[0]?.location === 'remote') {
        return {
          sessionDescription: { type: 'offer', sdp: 'remote-offer' },
          tracks: [{ mid: '1', trackName: 'camera-track-1', kind: 'video', status: 'active' }]
        }
      }
      return { tracks: [] }
    }))
    const announce = vi.fn()
    const { useOfficeRealtime } = await import('~~/app/composables/useOfficeRealtime')
    const realtime = useOfficeRealtime({
      officeId: ref('office-1'),
      zoneId: ref('zone-1'),
      mediaSession: ref(mediaSession()),
      remoteTracks: ref([remoteCapability()]),
      announcePublishedTracks: announce,
      getStreams: () => [fakeStream([fakeTrack('microphone-local', 'audio')])]
    })

    await realtime.publish()

    const trackRequests = requests.filter(item => item.request.endsWith('/tracks'))
    expect(trackRequests).toHaveLength(2)
    expect(trackRequests[0]?.options).toMatchObject({
      headers: { Authorization: 'Bearer signed-media-grant' },
      body: {
        tracks: [{ location: 'local', mid: '0', trackName: 'microphone-local', kind: 'audio' }]
      }
    })
    expect(trackRequests[1]?.options).toMatchObject({
      headers: { Authorization: 'Bearer signed-media-grant' },
      body: {
        tracks: [{
          location: 'remote',
          sessionId: 'publisher-session-1',
          trackName: 'camera-track-1',
          kind: 'video',
          capability: 'signed-track-capability'
        }]
      }
    })
    expect(announce).toHaveBeenCalledWith('subscriber-session-1', [{
      trackName: 'assigned-microphone-track',
      kind: 'audio'
    }])
  })

  it('creates a receive-only peer connection when no local device is enabled', async () => {
    const fetcher = vi.fn(async (request: string, _options?: Record<string, unknown>) => {
      if (request.endsWith('/tracks')) {
        return {
          sessionDescription: { type: 'offer', sdp: 'remote-offer' },
          tracks: [{ mid: '0', status: 'active' }]
        }
      }
      return { tracks: [] }
    })
    vi.stubGlobal('$fetch', fetcher)
    const { useOfficeRealtime } = await import('~~/app/composables/useOfficeRealtime')
    const realtime = useOfficeRealtime({
      officeId: ref('office-1'),
      zoneId: ref('zone-1'),
      mediaSession: ref(mediaSession()),
      remoteTracks: ref([remoteCapability()]),
      getStreams: () => []
    })

    await realtime.publish()
    await nextTick()

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/tracks$/),
      expect.objectContaining({
        headers: { Authorization: 'Bearer signed-media-grant' },
        body: expect.objectContaining({
          tracks: [expect.objectContaining({ location: 'remote' })]
        })
      })
    )
    expect(realtime.activeSessionId.value).toBe('subscriber-session-1')
  })

  it('uses the retained grant to close tracks after room state clears the session ref', async () => {
    const requests: Array<{ request: string, options?: Record<string, unknown> }> = []
    vi.stubGlobal('$fetch', vi.fn(async (request: string, options?: Record<string, unknown>) => {
      requests.push({ request, options })
      if (request.endsWith('/tracks')) {
        return {
          sessionDescription: { type: 'answer', sdp: 'remote-answer' },
          tracks: [{ mid: '0', trackName: 'assigned-camera-track', kind: 'video', status: 'active' }]
        }
      }
      return { tracks: [] }
    }))
    const session = ref<OfficeMediaSession | null>(mediaSession())
    const { useOfficeRealtime } = await import('~~/app/composables/useOfficeRealtime')
    const realtime = useOfficeRealtime({
      officeId: ref('office-1'),
      zoneId: ref('zone-1'),
      mediaSession: session,
      getStreams: () => [fakeStream([fakeTrack('camera-local', 'video')])]
    })
    await realtime.publish()

    session.value = null
    await nextTick()
    await Promise.resolve()

    expect(requests.find(item => item.request.endsWith('/tracks/close'))).toMatchObject({
      options: {
        method: 'PUT',
        headers: { Authorization: 'Bearer signed-media-grant' },
        body: {
          zone_id: 'zone-1',
          tracks: [{ mid: '0' }],
          force: true
        }
      }
    })
  })
})
