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
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryOneFresh: (...args: unknown[]) => mockQueryOne(...args)
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

  it('returns navigation stats and recent notifications from one fresh query', async () => {
    mockQueryOne.mockResolvedValueOnce({
      pending_approvals: '3',
      unread_notifications: '5',
      active_projects: '2',
      open_requests: '4',
      recent_notifications: [{
        id: 'notification-1',
        type: 'project_updated',
        title: 'Timeline updated',
        message: 'The launch date changed',
        actionUrl: '/portal/projects/project-1',
        isRead: false,
        createdAt: '2026-07-27T08:00:00.000Z'
      }]
    })

    const result = await meHandler({})

    expect(result.stats).toEqual({
      pendingApprovals: 3,
      unreadNotifications: 5,
      activeProjects: 2,
      openRequests: 4
    })
    expect(result.recentNotifications).toEqual([{
      id: 'notification-1',
      type: 'project_updated',
      title: 'Timeline updated',
      message: 'The launch date changed',
      actionUrl: '/portal/projects/project-1',
      isRead: false,
      createdAt: '2026-07-27T08:00:00.000Z'
    }])
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockQueryOne.mock.calls[0][0]).toContain('FROM client_requests')
    expect(mockQueryOne.mock.calls[0][0]).toContain('FROM client_notifications')
    expect(mockQueryOne.mock.calls[0][1]).toEqual([
      'client-1',
      'client-user-1',
      true,
      true,
      true
    ])
  })
})
