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

const mockQueryOne = vi.fn()
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockExpireStaleOfficeLobbyRequests = vi.fn()
const mockMarkOfficeLobbyNotificationsRead = vi.fn()
const mockRevokeOfficeGuestBadgeForRequest = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args),
  expireStaleOfficeLobbyRequests: (...args: unknown[]) => mockExpireStaleOfficeLobbyRequests(...args),
  markOfficeLobbyNotificationsRead: (...args: unknown[]) => mockMarkOfficeLobbyNotificationsRead(...args)
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  revokeOfficeGuestBadgeForRequest: (...args: unknown[]) => mockRevokeOfficeGuestBadgeForRequest(...args)
}))

const { default: handler } = await import(
  '../../../../../../server/api/public/office-lobby/[officeId]/request/[requestId]/cancel.post'
)

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1', requestId: 'request-1' } }
  } satisfies TestEvent
}

describe('POST /api/public/office-lobby/:officeId/request/:requestId/cancel', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockEnsureOfficeLobbyRequestsTable.mockReset()
    mockExpireStaleOfficeLobbyRequests.mockReset()
    mockMarkOfficeLobbyNotificationsRead.mockReset()
    mockRevokeOfficeGuestBadgeForRequest.mockReset()
    mockEnsureOfficeLobbyRequestsTable.mockResolvedValue(undefined)
    mockExpireStaleOfficeLobbyRequests.mockResolvedValue(undefined)
    mockMarkOfficeLobbyNotificationsRead.mockResolvedValue(undefined)
    mockRevokeOfficeGuestBadgeForRequest.mockResolvedValue(undefined)
  })

  it('expires pending lobby requests and marks notifications read', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      status: 'expired',
      notification_ids: ['notification-1']
    })

    const result = await handler(fakeEvent())

    expect(result.request).toMatchObject({ id: 'request-1', status: 'expired' })
    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledOnce()
    expect(mockExpireStaleOfficeLobbyRequests).toHaveBeenCalledWith('office-1', 'request-1')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('status IN (\'pending\', \'accepted\')')
    expect(mockMarkOfficeLobbyNotificationsRead).toHaveBeenCalledWith(['notification-1'])
  })

  it('revokes accepted guest badge access when a guest leaves the room', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      status: 'expired',
      notification_ids: []
    })

    await handler(fakeEvent())

    expect(mockRevokeOfficeGuestBadgeForRequest).toHaveBeenCalledWith({
      officeId: 'office-1',
      lobbyRequestId: 'request-1',
      status: 'expired'
    })
  })

  it('rejects requests that are no longer cancellable', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Lobby request can no longer be cancelled'
    })

    expect(mockMarkOfficeLobbyNotificationsRead).not.toHaveBeenCalled()
    expect(mockRevokeOfficeGuestBadgeForRequest).not.toHaveBeenCalled()
  })
})
