import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
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
const mockNotifyOfficeZoneDeleted = vi.fn()

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
  notifyOfficeZoneDeleted: (...args: unknown[]) => mockNotifyOfficeZoneDeleted(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/zones/[zoneId].delete'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1', zoneId: 'zone-1' } }
  } satisfies TestEvent
}

describe('DELETE /api/office/:officeId/zones/:zoneId', () => {
  beforeEach(() => {
    mockRequireOfficeAdmin.mockReset()
    mockQueryOne.mockReset()
    mockExecute.mockReset()
    mockLogOfficeAuditEvent.mockReset()
    mockNotifyOfficeZoneDeleted.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockQueryOne.mockResolvedValue({
      id: 'zone-1',
      slug: 'focus-room',
      name: 'Focus Room',
      zone_type: 'focus',
      capacity: 4,
      is_private: true,
      acl: { allowed_roles: ['admin'] },
      position: { x: 10, y: 20, w: 180, h: 120 }
    })
    mockExecute.mockResolvedValue(1)
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
    mockNotifyOfficeZoneDeleted.mockResolvedValue(undefined)
  })

  it('deletes a zone and records a snapshot audit event', async () => {
    const response = await handler(fakeEvent())

    expect(response).toEqual({ deleted: 1 })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('SELECT *'),
      ['zone-1', 'office-1']
    )
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM office_zones'),
      ['zone-1', 'office-1']
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith({
      officeId: 'office-1',
      actorId: 'admin-1',
      action: 'zone.deleted',
      targetType: 'office_zone',
      targetId: 'zone-1',
      metadata: {
        slug: 'focus-room',
        name: 'Focus Room',
        zone_type: 'focus',
        capacity: 4,
        is_private: true,
        acl: { allowed_roles: ['admin'] },
        position: { x: 10, y: 20, w: 180, h: 120 }
      }
    })
    expect(mockNotifyOfficeZoneDeleted).toHaveBeenCalledWith(expect.any(Object), 'office-1', 'zone-1')
  })

  it('returns 404 and does not audit when the zone does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Zone not found'
    })

    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('returns 404 and does not audit if delete removes no row', async () => {
    mockExecute.mockResolvedValueOnce(0)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Zone not found'
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM office_zones'),
      ['zone-1', 'office-1']
    )
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
