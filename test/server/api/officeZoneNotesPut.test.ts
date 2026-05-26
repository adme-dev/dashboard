import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  error.data = opts.data
  return error
}

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockEnsureOfficeZoneThreadChannel = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeZoneThreadChannel: (...args: unknown[]) => mockEnsureOfficeZoneThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/zones/[zoneId]/notes.put'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', zoneId: 'zone-1' } },
    body
  } satisfies TestEvent
}

function zone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'zone-1',
    office_id: 'office-1',
    slug: 'meeting-a',
    name: 'Meeting A',
    zone_type: 'meeting',
    position: { x: 0, y: 0, w: 100, h: 100 },
    capacity: 12,
    is_private: false,
    acl: {},
    notes: '',
    notes_version: 0,
    notes_updated_at: null,
    notes_updated_by: null,
    created_at: '2026-05-26T00:00:00.000Z',
    ...overrides
  }
}

describe('PUT /api/office/:officeId/zones/:zoneId/notes', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeZoneThreadChannel.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeZoneThreadChannel.mockResolvedValue({ id: 'channel-1' })
  })

  it('updates accessible room notes with optimistic version checking', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member', user_id: 'user-1' })
      .mockResolvedValueOnce(zone())
      .mockResolvedValueOnce(zone({ notes: 'Decision log', notes_version: 1 }))
      .mockResolvedValueOnce({ id: 123 })

    const result = await handler(fakeEvent({ notes: 'Decision log', version: 0 }))

    expect(result.zone).toMatchObject({ notes: 'Decision log', notes_version: 1 })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('notes_version = notes_version + 1')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'Decision log',
      'user-1',
      'zone-1',
      'office-1',
      0
    ])
    expect(mockEnsureOfficeZoneThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      zoneId: 'zone-1',
      actorId: 'user-1'
    })
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Updated room notes: Meeting A\n\nDecision log',
      JSON.stringify({
        source: 'office_room_notes',
        office_id: 'office-1',
        zone_id: 'zone-1',
        notes_version: 1
      })
    ])
  })

  it('rejects writes when the room notes version has changed', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member', user_id: 'user-1' })
      .mockResolvedValueOnce(zone())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ notes: 'Newer notes', notes_version: 2 })

    await expect(handler(fakeEvent({ notes: 'Stale edit', version: 1 }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Room notes changed. Refresh before saving.'
    })
    expect(mockEnsureOfficeZoneThreadChannel).not.toHaveBeenCalled()
  })

  it('enforces private room ACLs', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member', user_id: 'user-1' })
      .mockResolvedValueOnce(zone({ is_private: true }))

    await expect(handler(fakeEvent({ notes: 'No access', version: 0 }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'private zone admin-only'
    })
  })
})
