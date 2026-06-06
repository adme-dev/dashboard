import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetSubscriber = vi.fn()
const mockUpdateSubscriber = vi.fn()
const mockRecordSuppressionEvent = vi.fn()
const mockGetAssignedClientIds = vi.fn()

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  readBody: typeof mockReadBody
  getRouterParam: typeof mockGetRouterParam
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.readBody = mockReadBody
testGlobal.getRouterParam = mockGetRouterParam

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/clientScoping', () => ({
  getAssignedClientIds: (...args: unknown[]) => mockGetAssignedClientIds(...args)
}))

vi.mock('~~/server/utils/email-marketing/db', () => ({
  getSubscriber: (...args: unknown[]) => mockGetSubscriber(...args),
  updateSubscriber: (...args: unknown[]) => mockUpdateSubscriber(...args)
}))

vi.mock('~~/server/utils/email-marketing/audit', () => ({
  recordSuppressionEvent: (...args: unknown[]) => mockRecordSuppressionEvent(...args)
}))

describe('email subscriber patch route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockGetAssignedClientIds.mockResolvedValue(['client-1'])
    mockGetRouterParam.mockReturnValue('sub-1')
    mockReadBody.mockResolvedValue({ status: 'blocklisted' })
    mockGetSubscriber.mockResolvedValue({
      id: 'sub-1',
      email: 'person@example.com',
      client_id: null,
      status: 'enabled'
    })
    mockUpdateSubscriber.mockResolvedValue({
      id: 'sub-1',
      email: 'person@example.com',
      client_id: null,
      status: 'blocklisted'
    })
    mockRecordSuppressionEvent.mockResolvedValue(undefined)
  })

  it('records suppression history when staff blocklists a subscriber status', async () => {
    const handler = (await import('~~/server/api/email/subscribers/[id].patch')).default

    const result = await handler({} as never)

    expect(mockUpdateSubscriber).toHaveBeenCalledWith('sub-1', { status: 'blocklisted' })
    expect(mockRecordSuppressionEvent).toHaveBeenCalledWith({
      email: 'person@example.com',
      subscriberId: 'sub-1',
      reason: 'manual',
      action: 'recorded',
      source: 'manual',
      actorUserId: 'user-1',
      metadata: {
        route: 'email_subscriber_patch',
        previousStatus: 'enabled',
        status: 'blocklisted'
      }
    })
    expect(result).toEqual({
      subscriber: expect.objectContaining({ id: 'sub-1', status: 'blocklisted' })
    })
  })

  it('records suppression history when staff removes a blocklisted subscriber status', async () => {
    const handler = (await import('~~/server/api/email/subscribers/[id].patch')).default
    mockReadBody.mockResolvedValueOnce({ status: 'enabled' })
    mockGetSubscriber.mockResolvedValueOnce({
      id: 'sub-1',
      email: 'person@example.com',
      client_id: null,
      status: 'blocklisted'
    })
    mockUpdateSubscriber.mockResolvedValueOnce({
      id: 'sub-1',
      email: 'person@example.com',
      client_id: null,
      status: 'enabled'
    })

    await handler({} as never)

    expect(mockRecordSuppressionEvent).toHaveBeenCalledWith({
      email: 'person@example.com',
      subscriberId: 'sub-1',
      reason: 'manual',
      action: 'removed',
      source: 'manual',
      actorUserId: 'user-1',
      metadata: {
        route: 'email_subscriber_patch',
        previousStatus: 'blocklisted',
        status: 'enabled'
      }
    })
  })

  it('does not write suppression history for non-blocklist profile edits', async () => {
    const handler = (await import('~~/server/api/email/subscribers/[id].patch')).default
    mockReadBody.mockResolvedValueOnce({ name: 'Person Two' })
    mockUpdateSubscriber.mockResolvedValueOnce({
      id: 'sub-1',
      email: 'person@example.com',
      client_id: null,
      status: 'enabled',
      name: 'Person Two'
    })

    await handler({} as never)

    expect(mockRecordSuppressionEvent).not.toHaveBeenCalled()
  })
})
