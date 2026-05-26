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
const mockExecute = vi.fn()
const mockQueryOne = vi.fn()
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
  '../../../../server/api/office/[officeId]/zones/[zoneId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', zoneId: 'zone-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/zones/:zoneId', () => {
  beforeEach(() => {
    mockRequireOfficeAdmin.mockReset()
    mockExecute.mockReset()
    mockQueryOne.mockReset()
    mockLogOfficeAuditEvent.mockReset()
    mockNotifyOfficeZoneUpserted.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockQueryOne.mockResolvedValue(null)
    mockExecute.mockResolvedValue(1)
    mockNotifyOfficeZoneUpserted.mockResolvedValue(undefined)
  })

  it('updates zone access policy and records an audit event', async () => {
    const acl = { allowed_roles: ['admin', 'member'], public_lobby: true }
    mockQueryOne.mockResolvedValueOnce({
      id: 'zone-1',
      capacity: 12,
      zone_type: 'meeting',
      is_private: true,
      acl
    })

    const response = await handler(fakeEvent({
      is_private: true,
      acl
    }))

    expect(response).toEqual({ updated: 1 })
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_zones SET is_private = $1, acl = $2'),
      [
        true,
        JSON.stringify(acl),
        'zone-1',
        'office-1'
      ]
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith({
      officeId: 'office-1',
      actorId: 'admin-1',
      action: 'zone.updated',
      targetType: 'office_zone',
      targetId: 'zone-1',
      metadata: expect.objectContaining({
        changed: ['is_private', 'acl'],
        is_private: true,
        acl
      })
    })
    expect(mockNotifyOfficeZoneUpserted).toHaveBeenCalledWith(
      expect.any(Object),
      'office-1',
      expect.objectContaining({ id: 'zone-1' })
    )
  })

  it('does not audit empty updates', async () => {
    const response = await handler(fakeEvent({}))

    expect(response).toEqual({ updated: 0 })
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('returns a clear conflict when changing to another room slug', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'zone-2' })

    await expect(handler(fakeEvent({ slug: 'meeting-room-a' }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Room slug already exists'
    })

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('WHERE office_id = $1 AND slug = $2 AND id <> $3'),
      ['office-1', 'meeting-room-a', 'zone-1']
    )
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('returns 404 and does not audit when the zone does not exist', async () => {
    mockExecute.mockResolvedValueOnce(0)

    await expect(handler(fakeEvent({ name: 'Missing Room' }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Zone not found'
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_zones SET name = $1'),
      ['Missing Room', 'zone-1', 'office-1']
    )
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects blank room names before updating', async () => {
    await expect(handler(fakeEvent({ name: '   ' }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('trims room slugs before conflict checks and update', async () => {
    await handler(fakeEvent({ slug: '  trimmed-room  ' }))

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('WHERE office_id = $1 AND slug = $2 AND id <> $3'),
      ['office-1', 'trimmed-room', 'zone-1']
    )
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_zones SET slug = $1'),
      ['trimmed-room', 'zone-1', 'office-1']
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ slug: 'trimmed-room' })
    }))
  })

  it('rejects unsupported ACL roles before updating', async () => {
    await expect(handler(fakeEvent({
      acl: { allowed_roles: ['owner'] }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('deduplicates ACL arrays before updating and auditing', async () => {
    await handler(fakeEvent({
      acl: { allowed_roles: ['member', 'member', 'admin'] }
    }))

    const normalizedAcl = { allowed_roles: ['member', 'admin'] }
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_zones SET acl = $1'),
      [JSON.stringify(normalizedAcl), 'zone-1', 'office-1']
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ acl: normalizedAcl })
    }))
  })

  it('normalizes empty ACL arrays to an empty object before updating', async () => {
    await handler(fakeEvent({
      acl: { allowed_roles: [], allowed_clients: [], public_lobby: false }
    }))

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_zones SET acl = $1'),
      [JSON.stringify({}), 'zone-1', 'office-1']
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ acl: {} })
    }))
  })

  it('rejects negative room positions before updating', async () => {
    await expect(handler(fakeEvent({
      position: { x: 80, y: -1, w: 240, h: 160 }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
