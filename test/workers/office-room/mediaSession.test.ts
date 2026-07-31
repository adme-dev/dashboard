import { describe, expect, it, vi } from 'vitest'
import {
  verifyOfficeMediaGrant,
  verifyOfficeRemoteTrackGrant
} from '~~/server/utils/officeRealtimeAccess'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown
    env: unknown

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  }
}))

const { OfficeRoom } = await import('../../../workers/office-room/src/OfficeRoom')

function fakeSocket(input: {
  handle?: `user:${string}` | `client:${string}`
  name?: string
} = {}) {
  const attachment = {
    officeId: 'office-1',
    handle: input.handle ?? 'user:user-1',
    name: input.name ?? 'Staff',
    avatarUrl: null,
    role: 'member' as const,
    isGuest: false,
    allowedZoneId: null,
    guestBadgeId: null,
    zoneCapacities: { 'zone-1': 4, 'zone-2': 4 },
    zoneAccessPolicies: {},
    joinedAt: 1
  }
  return {
    sent: [] as Array<Record<string, unknown>>,
    readyState: WebSocket.OPEN,
    send(message: string) {
      this.sent.push(JSON.parse(message) as Record<string, unknown>)
    },
    close: vi.fn(),
    deserializeAttachment() {
      return attachment
    },
    serializeAttachment(next: typeof attachment) {
      Object.assign(attachment, next)
    }
  }
}

function fakeContext(sockets: Array<ReturnType<typeof fakeSocket>>) {
  const pending: Promise<unknown>[] = []
  return {
    pending,
    id: { toString: () => 'office-1' },
    getWebSockets: () => sockets,
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise)
    },
    acceptWebSocket: vi.fn(),
    storage: { setAlarm: vi.fn() }
  }
}

describe('OfficeRoom media session admission', () => {
  it('returns a signed actor/session grant after successful room entry', async () => {
    const socket = fakeSocket()
    const context = fakeContext([socket])
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessionId: 'session-1'
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetcher)
    const room = new OfficeRoom(context as never, {
      OFFICE_SYNC_SECRET: 'office-secret',
      REALTIME_APP_ID: 'app-1',
      REALTIME_APP_SECRET: 'realtime-secret'
    } as never)

    await room.webSocketMessage(socket as never, JSON.stringify({
      type: 'zone:enter',
      zoneId: 'zone-1'
    }))
    await Promise.all(context.pending)

    const message = socket.sent.find(item => item.type === 'zone:media-session')
    expect(message).toMatchObject({
      type: 'zone:media-session',
      zoneId: 'zone-1',
      media: {
        provider: 'cloudflare-realtime',
        sessionId: 'session-1',
        grantExpiresAt: expect.any(Number)
      }
    })
    const media = message?.media as { grant?: string } | undefined
    await expect(
      verifyOfficeMediaGrant(media?.grant ?? '', 'office-secret')
    ).resolves.toMatchObject({
      officeId: 'office-1',
      zoneId: 'zone-1',
      handle: 'user:user-1',
      sessionId: 'session-1'
    })

    socket.sent.length = 0
    await room.webSocketMessage(socket as never, JSON.stringify({
      type: 'media:grant-refresh',
      sessionId: 'session-1'
    }))
    const refreshed = socket.sent.find(item => item.type === 'zone:media-session')
    expect(refreshed).toMatchObject({
      zoneId: 'zone-1',
      media: {
        sessionId: 'session-1',
        grantExpiresAt: expect.any(Number)
      }
    })
    await expect(
      verifyOfficeMediaGrant(
        String((refreshed?.media as { grant?: string } | undefined)?.grant ?? ''),
        'office-secret'
      )
    ).resolves.toMatchObject({
      sessionId: 'session-1',
      handle: 'user:user-1'
    })
  })

  it('rejects grant refresh for a substituted media session', async () => {
    const socket = fakeSocket()
    const context = fakeContext([socket])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessionId: 'session-1' }), { status: 201 })
    ))
    const room = new OfficeRoom(context as never, {
      OFFICE_SYNC_SECRET: 'office-secret',
      REALTIME_APP_ID: 'app-1',
      REALTIME_APP_SECRET: 'realtime-secret'
    } as never)
    await room.webSocketMessage(socket as never, JSON.stringify({ type: 'zone:enter', zoneId: 'zone-1' }))
    await Promise.all(context.pending)
    socket.sent.length = 0

    await room.webSocketMessage(socket as never, JSON.stringify({
      type: 'media:grant-refresh',
      sessionId: 'attacker-session'
    }))

    expect(socket.sent).toContainEqual({
      type: 'error',
      message: 'media session does not match the active zone'
    })
    expect(socket.sent.find(item => item.type === 'zone:media-session')).toBeUndefined()
  })

  it('publishes signed track capabilities only to other participants in the same zone', async () => {
    const publisher = fakeSocket({ handle: 'user:publisher-1', name: 'Publisher' })
    const subscriber = fakeSocket({ handle: 'user:subscriber-1', name: 'Subscriber' })
    const otherZone = fakeSocket({ handle: 'user:other-1', name: 'Other' })
    const context = fakeContext([publisher, subscriber, otherZone])
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: 'publisher-session-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: 'subscriber-session-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: 'other-session-1' }), { status: 201 }))
    vi.stubGlobal('fetch', fetcher)
    const room = new OfficeRoom(context as never, {
      OFFICE_SYNC_SECRET: 'office-secret',
      REALTIME_APP_ID: 'app-1',
      REALTIME_APP_SECRET: 'realtime-secret'
    } as never)

    await room.webSocketMessage(publisher as never, JSON.stringify({ type: 'zone:enter', zoneId: 'zone-1' }))
    await Promise.all(context.pending)
    await room.webSocketMessage(subscriber as never, JSON.stringify({ type: 'zone:enter', zoneId: 'zone-1' }))
    await Promise.all(context.pending)
    await room.webSocketMessage(otherZone as never, JSON.stringify({ type: 'zone:enter', zoneId: 'zone-2' }))
    await Promise.all(context.pending)
    publisher.sent.length = 0
    subscriber.sent.length = 0
    otherZone.sent.length = 0

    await room.webSocketMessage(publisher as never, JSON.stringify({
      type: 'media:tracks-published',
      sessionId: 'publisher-session-1',
      tracks: [{ trackName: 'camera-track-1', kind: 'video' }]
    }))

    const subscriberCatalog = subscriber.sent.find(item => item.type === 'zone:media-tracks')
    expect(subscriberCatalog).toMatchObject({
      type: 'zone:media-tracks',
      zoneId: 'zone-1',
      tracks: [{
        publisherHandle: 'user:publisher-1',
        publisherSessionId: 'publisher-session-1',
        trackName: 'camera-track-1',
        kind: 'video',
        expiresAt: expect.any(Number),
        capability: expect.any(String)
      }]
    })
    expect(publisher.sent.find(item => item.type === 'zone:media-tracks')).toMatchObject({
      tracks: []
    })
    expect(otherZone.sent).toEqual([])

    const track = (subscriberCatalog?.tracks as Array<{ capability: string }> | undefined)?.[0]
    await expect(
      verifyOfficeRemoteTrackGrant(track?.capability ?? '', 'office-secret')
    ).resolves.toMatchObject({
      officeId: 'office-1',
      zoneId: 'zone-1',
      publisherHandle: 'user:publisher-1',
      publisherSessionId: 'publisher-session-1',
      trackName: 'camera-track-1',
      kind: 'video'
    })
  })

  it('removes a publisher track catalog when they leave the zone', async () => {
    const publisher = fakeSocket({ handle: 'user:publisher-1', name: 'Publisher' })
    const subscriber = fakeSocket({ handle: 'user:subscriber-1', name: 'Subscriber' })
    const context = fakeContext([publisher, subscriber])
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: 'publisher-session-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: 'subscriber-session-1' }), { status: 201 }))
    vi.stubGlobal('fetch', fetcher)
    const room = new OfficeRoom(context as never, {
      OFFICE_SYNC_SECRET: 'office-secret',
      REALTIME_APP_ID: 'app-1',
      REALTIME_APP_SECRET: 'realtime-secret'
    } as never)

    await room.webSocketMessage(publisher as never, JSON.stringify({ type: 'zone:enter', zoneId: 'zone-1' }))
    await Promise.all(context.pending)
    await room.webSocketMessage(subscriber as never, JSON.stringify({ type: 'zone:enter', zoneId: 'zone-1' }))
    await Promise.all(context.pending)
    await room.webSocketMessage(publisher as never, JSON.stringify({
      type: 'media:tracks-published',
      sessionId: 'publisher-session-1',
      tracks: [{ trackName: 'microphone-track-1', kind: 'audio' }]
    }))
    subscriber.sent.length = 0

    await room.webSocketMessage(publisher as never, JSON.stringify({ type: 'zone:leave' }))

    expect(subscriber.sent.find(item => item.type === 'zone:media-tracks')).toMatchObject({
      type: 'zone:media-tracks',
      zoneId: 'zone-1',
      tracks: []
    })
  })
})
