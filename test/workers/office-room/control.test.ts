import { describe, expect, it, vi } from 'vitest'
import type { ActorHandle, OfficeZoneAccessPolicy, OfficeZoneRow } from '../../../app/types/office'

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

type FakeSocket = {
  sent: unknown[]
  send: (message: string) => void
  deserializeAttachment: () => unknown
  readyState: number
}

type TestParticipantState = {
  handle: ActorHandle
  role: 'admin' | 'member' | 'guest'
  currentZoneId: string | null
  lastSeenAt: number
  zoneCapacities: Record<string, number>
  zoneAccessPolicies: Record<string, OfficeZoneAccessPolicy>
}

type TestOfficeRoom = {
  participants: Map<ActorHandle, TestParticipantState>
}

function fakeSocket(handle: `user:${string}`): FakeSocket {
  return {
    sent: [],
    readyState: WebSocket.OPEN,
    send(message: string) {
      this.sent.push(JSON.parse(message))
    },
    deserializeAttachment() {
      return {
        officeId: 'office-1',
        handle,
        name: handle,
        avatarUrl: null,
        role: 'member',
        isGuest: false,
        allowedZoneId: null,
        guestBadgeId: null,
        zoneCapacities: {},
        zoneAccessPolicies: {},
        joinedAt: 1
      }
    }
  }
}

function fakeContext(sockets: FakeSocket[]) {
  return {
    id: { toString: () => 'office-1' },
    getWebSockets: () => sockets,
    waitUntil: vi.fn(),
    acceptWebSocket: vi.fn(),
    storage: { setAlarm: vi.fn() }
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

describe('OfficeRoom control endpoints', () => {
  it('broadcasts zone upserts to attached sockets', async () => {
    const socket = fakeSocket('user:u1')
    const room = new OfficeRoom(fakeContext([socket]) as never, {} as never)

    const response = await room.fetch(new Request('https://office-room-do/admin/zone-upserted', {
      method: 'POST',
      body: JSON.stringify({ zoneId: zone.id, zone })
    }))

    expect(response.status).toBe(200)
    expect(socket.sent).toContainEqual({
      type: 'zone:upserted',
      zone
    })
  })

  it('evicts occupants when a zone upsert revokes their access', async () => {
    const socket = fakeSocket('user:u1')
    const room = new OfficeRoom(fakeContext([socket]) as never, {} as never)
    const participant = (room as unknown as TestOfficeRoom).participants.get('user:u1')
    expect(participant).toBeTruthy()
    participant!.currentZoneId = zone.id
    participant!.zoneAccessPolicies = {
      [zone.id]: { zone_type: 'meeting', is_private: false, acl: {} }
    }

    const privateZone: OfficeZoneRow = {
      ...zone,
      is_private: true,
      acl: { allowed_roles: ['admin'] }
    }
    const response = await room.fetch(new Request('https://office-room-do/admin/zone-upserted', {
      method: 'POST',
      body: JSON.stringify({ zoneId: privateZone.id, zone: privateZone })
    }))

    expect(response.status).toBe(200)
    expect(participant!.currentZoneId).toBeNull()
    expect(socket.sent).toContainEqual({
      type: 'zone:access-revoked',
      zoneId: zone.id,
      reason: 'role member not in zone allow-list'
    })
    expect(socket.sent).toContainEqual({
      type: 'participant:moved',
      handle: 'user:u1',
      zoneId: null
    })
    expect(socket.sent).toContainEqual({
      type: 'zone:upserted',
      zone: privateZone
    })
  })

  it('applies updated zone capacity to later entry attempts', async () => {
    const firstSocket = fakeSocket('user:u1')
    const secondSocket = fakeSocket('user:u2')
    const room = new OfficeRoom(fakeContext([firstSocket, secondSocket]) as never, {} as never)
    const firstParticipant = (room as unknown as TestOfficeRoom).participants.get('user:u1')
    expect(firstParticipant).toBeTruthy()
    firstParticipant!.currentZoneId = zone.id

    const fullZone: OfficeZoneRow = {
      ...zone,
      capacity: 1
    }
    const response = await room.fetch(new Request('https://office-room-do/admin/zone-upserted', {
      method: 'POST',
      body: JSON.stringify({ zoneId: fullZone.id, zone: fullZone })
    }))
    await room.webSocketMessage(secondSocket as never, JSON.stringify({ type: 'zone:enter', zoneId: zone.id }))

    expect(response.status).toBe(200)
    expect(firstParticipant!.zoneCapacities[zone.id]).toBe(1)
    expect(secondSocket.sent).toContainEqual({
      type: 'zone:full',
      zoneId: zone.id
    })
  })

  it('broadcasts zone deletion to attached sockets', async () => {
    const socket = fakeSocket('user:u1')
    const room = new OfficeRoom(fakeContext([socket]) as never, {} as never)

    const response = await room.fetch(new Request('https://office-room-do/admin/zone-deleted', {
      method: 'POST',
      body: JSON.stringify({ zoneId: zone.id })
    }))

    expect(response.status).toBe(200)
    expect(socket.sent).toContainEqual({
      type: 'zone:deleted',
      zoneId: zone.id,
      reason: 'This room was removed by an office admin.'
    })
  })

  it('moves occupants out when their room is deleted', async () => {
    const socket = fakeSocket('user:u1')
    const room = new OfficeRoom(fakeContext([socket]) as never, {} as never)
    const participant = (room as unknown as TestOfficeRoom).participants.get('user:u1')
    expect(participant).toBeTruthy()
    participant!.currentZoneId = zone.id
    participant!.zoneCapacities = { [zone.id]: zone.capacity }
    participant!.zoneAccessPolicies = {
      [zone.id]: { zone_type: zone.zone_type, is_private: zone.is_private, acl: zone.acl }
    }

    const response = await room.fetch(new Request('https://office-room-do/admin/zone-deleted', {
      method: 'POST',
      body: JSON.stringify({ zoneId: zone.id })
    }))

    expect(response.status).toBe(200)
    expect(participant!.currentZoneId).toBeNull()
    expect(participant!.zoneCapacities[zone.id]).toBeUndefined()
    expect(participant!.zoneAccessPolicies[zone.id]).toBeUndefined()
    expect(socket.sent).toContainEqual({
      type: 'participant:moved',
      handle: 'user:u1',
      zoneId: null
    })
    expect(socket.sent).toContainEqual({
      type: 'zone:deleted',
      zoneId: zone.id,
      reason: 'This room was removed by an office admin.'
    })
  })

  it('rejects malformed zone upserts', async () => {
    const socket = fakeSocket('user:u1')
    const room = new OfficeRoom(fakeContext([socket]) as never, {} as never)

    const response = await room.fetch(new Request('https://office-room-do/admin/zone-upserted', {
      method: 'POST',
      body: JSON.stringify({ zoneId: zone.id, zone: { ...zone, id: 'other-zone' } })
    }))

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('valid zone required')
    expect(socket.sent).toEqual([])
  })

  it('rejects zone upserts with unsupported room metadata', async () => {
    const socket = fakeSocket('user:u1')
    const room = new OfficeRoom(fakeContext([socket]) as never, {} as never)

    for (const malformedZone of [
      { ...zone, zone_type: 'kitchen' },
      { ...zone, capacity: 0 },
      { ...zone, capacity: 1.5 },
      { ...zone, position: { ...zone.position, x: -1 } },
      { ...zone, position: { ...zone.position, w: 0 } }
    ]) {
      const response = await room.fetch(new Request('https://office-room-do/admin/zone-upserted', {
        method: 'POST',
        body: JSON.stringify({ zoneId: zone.id, zone: malformedZone })
      }))

      expect(response.status).toBe(400)
      expect(await response.text()).toBe('valid zone required')
    }
    expect(socket.sent).toEqual([])
  })

  it('rejects control requests without a zone id', async () => {
    const socket = fakeSocket('user:u1')
    const room = new OfficeRoom(fakeContext([socket]) as never, {} as never)

    const response = await room.fetch(new Request('https://office-room-do/admin/zone-deleted', {
      method: 'POST',
      body: JSON.stringify({})
    }))

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('zoneId required')
    expect(socket.sent).toEqual([])
  })

  it('returns not found for unknown control paths', async () => {
    const socket = fakeSocket('user:u1')
    const room = new OfficeRoom(fakeContext([socket]) as never, {} as never)

    const response = await room.fetch(new Request('https://office-room-do/admin/unknown', {
      method: 'POST',
      body: JSON.stringify({ zoneId: zone.id })
    }))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
    expect(socket.sent).toEqual([])
  })
})
