import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: meHandler } = await import('../../../../server/api/portal/auth/me.get')

describe('portal auth me API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'client-user-1',
      email: 'jane@example.com',
      name: 'Jane Client',
      title: 'Marketing Director',
      phone: '+61 400 000 000',
      avatarUrl: null,
      role: 'client_admin',
      isPrimaryContact: true,
      clientId: 'client-1',
      clientName: 'Client Co',
      clientLogo: null,
      notificationPreferences: {},
      timezone: 'Australia/Melbourne',
      permissions: {
        canViewProjects: true,
        canApproveWork: true,
        canSubmitRequests: true
      }
    })
  })

  it('returns portal navigation stats including open client requests', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ count: '3' })
      .mockResolvedValueOnce({ count: '5' })
      .mockResolvedValueOnce({ count: '2' })
      .mockResolvedValueOnce({ count: '4' })

    const result = await meHandler({})

    expect(result.stats).toEqual({
      pendingApprovals: 3,
      unreadNotifications: 5,
      activeProjects: 2,
      openRequests: 4
    })
    expect(mockQueryOne).toHaveBeenCalledTimes(4)
    expect(mockQueryOne.mock.calls[3][0]).toContain('FROM client_requests')
    expect(mockQueryOne.mock.calls[3][0]).toContain('status NOT IN (\'completed\', \'closed\', \'cancelled\')')
    expect(mockQueryOne.mock.calls[3][1]).toEqual(['client-1'])
  })
})
