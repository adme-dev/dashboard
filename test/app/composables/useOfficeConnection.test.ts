import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, watch } from 'vue'
import type { OfficeZoneRow } from '~~/app/types/office'

const sockets: FakeWebSocket[] = []

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(public url: string) {
    sockets.push(this)
  }

  send(message: string) {
    this.sent.push(message)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code: 1000 })
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

const zone: OfficeZoneRow = {
  id: 'zone-1',
  office_id: 'office-1',
  slug: 'meeting-room-a',
  name: 'Meeting Room A',
  zone_type: 'meeting',
  position: { x: 80, y: 80, w: 240, h: 160 },
  capacity: 8,
  is_private: false,
  acl: {},
  notes: '',
  notes_version: 0,
  notes_updated_at: null,
  notes_updated_by: null,
  created_at: '2026-05-26T00:00:00.000Z'
}

async function flushConnection() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useOfficeConnection', () => {
  beforeEach(() => {
    sockets.length = 0
    vi.stubGlobal('window', {})
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('onBeforeUnmount', vi.fn())
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      token: 'token-1',
      workerUrl: 'wss://office-worker.test',
      exp: 1
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('tracks live zone upserts and restores zones after a delete marker', async () => {
    const { useOfficeConnection } = await import('~~/app/composables/useOfficeConnection')
    const connection = useOfficeConnection({ officeId: ref('office-1') })
    await flushConnection()

    sockets[0]!.receive({
      type: 'zone:deleted',
      zoneId: zone.id,
      reason: 'Room removed'
    })
    expect(connection.deletedZoneIds.value.has(zone.id)).toBe(true)

    sockets[0]!.receive({
      type: 'zone:upserted',
      zone: { ...zone, name: 'Renamed Room' }
    })

    expect(connection.deletedZoneIds.value.has(zone.id)).toBe(false)
    expect(connection.upsertedZones.value[zone.id]).toMatchObject({
      id: zone.id,
      name: 'Renamed Room'
    })
  })

  it('clears active room state when the current zone is deleted', async () => {
    const { useOfficeConnection } = await import('~~/app/composables/useOfficeConnection')
    const connection = useOfficeConnection({ officeId: ref('office-1') })
    await flushConnection()

    sockets[0]!.receive({ type: 'zone:entered', zoneId: zone.id })
    connection.zoneOccupancy.value = { [zone.id]: ['user:u1'] }
    connection.upsertedZones.value = { [zone.id]: zone }

    sockets[0]!.receive({
      type: 'zone:deleted',
      zoneId: zone.id,
      reason: 'Room removed'
    })

    expect(connection.currentZoneId.value).toBeNull()
    expect(connection.mediaSession.value).toBeNull()
    expect(connection.mediaUnavailable.value).toBeNull()
    expect(connection.zoneOccupancy.value[zone.id]).toBeUndefined()
    expect(connection.upsertedZones.value[zone.id]).toBeUndefined()
    expect(connection.joinFailure.value).toEqual({
      zoneId: zone.id,
      reason: 'denied',
      message: 'Room removed'
    })
    expect(connection.lastError.value).toBe('Room removed')
  })

  it('tracks same-zone remote capabilities and announces published tracks', async () => {
    const { useOfficeConnection } = await import('~~/app/composables/useOfficeConnection')
    const connection = useOfficeConnection({ officeId: ref('office-1') })
    await flushConnection()
    sockets[0]!.readyState = FakeWebSocket.OPEN
    sockets[0]!.receive({ type: 'zone:entered', zoneId: zone.id })
    sockets[0]!.receive({
      type: 'zone:media-tracks',
      zoneId: zone.id,
      tracks: [{
        publisherHandle: 'user:publisher-1',
        publisherSessionId: 'publisher-session-1',
        trackName: 'camera-track-1',
        kind: 'video',
        capability: 'signed-capability',
        expiresAt: Date.now() + 60_000
      }]
    })

    expect(connection.remoteTrackCapabilities.value).toHaveLength(1)
    expect(connection.remoteTrackCapabilities.value[0]).toMatchObject({
      publisherSessionId: 'publisher-session-1',
      trackName: 'camera-track-1'
    })

    connection.announcePublishedTracks('subscriber-session-1', [{
      trackName: 'microphone-track-1',
      kind: 'audio'
    }])
    expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toEqual({
      type: 'media:tracks-published',
      sessionId: 'subscriber-session-1',
      tracks: [{ trackName: 'microphone-track-1', kind: 'audio' }]
    })

    connection.leaveZone()
    expect(connection.remoteTrackCapabilities.value).toEqual([])
  })

  it('requests a fresh media grant before the current grant expires', async () => {
    vi.useFakeTimers()
    const { useOfficeConnection } = await import('~~/app/composables/useOfficeConnection')
    const connection = useOfficeConnection({ officeId: ref('office-1') })
    await vi.runAllTicks()
    await Promise.resolve()
    sockets[0]!.readyState = FakeWebSocket.OPEN
    sockets[0]!.receive({ type: 'zone:entered', zoneId: zone.id })
    sockets[0]!.receive({
      type: 'zone:media-session',
      zoneId: zone.id,
      media: {
        provider: 'cloudflare-realtime',
        sessionId: 'session-1',
        correlationId: 'office:office-1:zone:zone-1:actor:user:u1',
        grant: 'signed-media-grant',
        grantExpiresAt: Date.now() + 60_500,
        createdAt: Date.now()
      }
    })

    await vi.advanceTimersByTimeAsync(1000)

    expect(sockets[0]!.sent.map(message => JSON.parse(message))).toContainEqual({
      type: 'media:grant-refresh',
      sessionId: 'session-1'
    })
    connection.disconnect()
    vi.useRealTimers()
  })
})
