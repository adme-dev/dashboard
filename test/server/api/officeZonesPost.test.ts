import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireOfficeAdmin = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()
const mockNotifyOfficeZoneUpserted = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRoom', () => ({
  requireOfficeAdmin: (...args: unknown[]) => mockRequireOfficeAdmin(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

vi.mock('~~/server/utils/officeRoomControl', () => ({
  notifyOfficeZoneUpserted: (...args: unknown[]) => mockNotifyOfficeZoneUpserted(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/zones.post'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/zones', () => {
  beforeEach(() => {
    mockRequireOfficeAdmin.mockReset()
    mockQueryOne.mockReset()
    mockExecute.mockReset()
    mockLogOfficeAuditEvent.mockReset()
    mockNotifyOfficeZoneUpserted.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'zone-1' })
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
    mockNotifyOfficeZoneUpserted.mockResolvedValue(undefined)
  })

  it('creates a zone and pre-creates its canonical room thread', async () => {
    const response = await handler(fakeEvent({
      slug: 'meeting-room-a',
      name: 'Meeting Room A',
      zone_type: 'meeting',
      position: { x: 80, y: 80, w: 240, h: 160 },
      capacity: 8,
      is_private: false
    }))

    expect(response).toEqual({ id: 'zone-1' })
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE office_id = $1 AND slug = $2'),
      ['office-1', 'meeting-room-a']
    )
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO office_zones'),
      [
        'office-1',
        'meeting-room-a',
        'Meeting Room A',
        'meeting',
        JSON.stringify({ x: 80, y: 80, w: 240, h: 160 }),
        8,
        false,
        JSON.stringify({})
      ]
    )
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO chat_channels'),
      [
        'Meeting Room A',
        'office-zone-zone-1',
        'Persistent room thread for Meeting Room A',
        'zone-1',
        'admin-1'
      ]
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith({
      officeId: 'office-1',
      actorId: 'admin-1',
      action: 'zone.created',
      targetType: 'office_zone',
      targetId: 'zone-1',
      metadata: expect.objectContaining({
        slug: 'meeting-room-a',
        name: 'Meeting Room A',
        zone_type: 'meeting',
        capacity: 8,
        is_private: false,
        acl: {}
      })
    })
    expect(mockNotifyOfficeZoneUpserted).toHaveBeenCalledWith(
      expect.any(Object),
      'office-1',
      expect.objectContaining({ id: 'zone-1' })
    )
  })

  it('returns a clear conflict when the room slug already exists', async () => {
    mockQueryOne.mockReset()
    mockQueryOne.mockResolvedValueOnce({ id: 'existing-zone' })

    await expect(handler(fakeEvent({
      slug: 'meeting-room-a',
      name: 'Meeting Room A',
      zone_type: 'meeting',
      position: { x: 80, y: 80, w: 240, h: 160 },
      capacity: 8
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Room slug already exists'
    })

    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects blank room names before inserting', async () => {
    await expect(handler(fakeEvent({
      slug: 'blank-room',
      name: '   ',
      zone_type: 'meeting',
      position: { x: 80, y: 80, w: 240, h: 160 },
      capacity: 8
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('trims room slugs before conflict checks and insert', async () => {
    mockQueryOne.mockReset()
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'zone-1' })

    await handler(fakeEvent({
      slug: '  trimmed-room  ',
      name: 'Trimmed Room',
      zone_type: 'meeting',
      position: { x: 80, y: 80, w: 240, h: 160 },
      capacity: 8
    }))

    expect(mockQueryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE office_id = $1 AND slug = $2'),
      ['office-1', 'trimmed-room']
    )
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO office_zones'),
      expect.arrayContaining(['trimmed-room'])
    )
  })

  it('rejects unsupported ACL roles before inserting', async () => {
    await expect(handler(fakeEvent({
      slug: 'bad-acl-room',
      name: 'Bad ACL Room',
      zone_type: 'meeting',
      position: { x: 80, y: 80, w: 240, h: 160 },
      capacity: 8,
      acl: { allowed_roles: ['owner'] }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('deduplicates ACL arrays before inserting and auditing', async () => {
    mockQueryOne.mockReset()
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'zone-1' })

    await handler(fakeEvent({
      slug: 'dedupe-acl-room',
      name: 'Dedupe ACL Room',
      zone_type: 'meeting',
      position: { x: 80, y: 80, w: 240, h: 160 },
      capacity: 8,
      acl: { allowed_roles: ['member', 'member', 'admin'] }
    }))

    const normalizedAcl = { allowed_roles: ['member', 'admin'] }
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO office_zones'),
      expect.arrayContaining([JSON.stringify(normalizedAcl)])
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ acl: normalizedAcl })
    }))
  })

  it('normalizes empty ACL arrays to an empty object before inserting', async () => {
    mockQueryOne.mockReset()
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'zone-1' })

    await handler(fakeEvent({
      slug: 'empty-acl-room',
      name: 'Empty ACL Room',
      zone_type: 'meeting',
      position: { x: 80, y: 80, w: 240, h: 160 },
      capacity: 8,
      acl: { allowed_roles: [], allowed_clients: [], public_lobby: false }
    }))

    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO office_zones'),
      expect.arrayContaining([JSON.stringify({})])
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ acl: {} })
    }))
  })

  it('rejects negative room positions before inserting', async () => {
    await expect(handler(fakeEvent({
      slug: 'negative-room',
      name: 'Negative Room',
      zone_type: 'meeting',
      position: { x: -1, y: 80, w: 240, h: 160 },
      capacity: 8
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
