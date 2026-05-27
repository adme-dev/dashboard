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
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: usersHandler } = await import('../../../../server/api/portal/users/index.get')

describe('portal users API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'client-user-1',
        email: 'jane@example.com',
        name: 'Jane Client',
        title: 'Marketing Director',
        role: 'client_admin',
        status: 'active',
        avatar_url: null,
        is_primary_contact: true,
        can_view_projects: true,
        can_view_invoices: true,
        can_approve_work: true,
        can_view_analytics: true,
        can_submit_requests: true,
        last_login_at: '2026-05-28T01:00:00Z',
        invited_at: null,
        created_at: '2026-05-01T00:00:00Z'
      },
      {
        id: 'client-user-2',
        email: 'sam@example.com',
        name: 'Sam Client',
        title: null,
        role: 'client_viewer',
        status: 'pending',
        avatar_url: null,
        is_primary_contact: false,
        can_view_projects: true,
        can_view_invoices: false,
        can_approve_work: false,
        can_view_analytics: false,
        can_submit_requests: false,
        last_login_at: null,
        invited_at: '2026-05-27T00:00:00Z',
        created_at: '2026-05-27T00:00:00Z'
      }
    ])
  })

  it('lists client-scoped portal users with permission summaries', async () => {
    const result = await usersHandler({})

    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('FROM client_users'),
      ['client-1', 'client-user-1']
    )
    expect(String(mockQueryRows.mock.calls[0][0])).toContain('WHERE client_id = $1')
    expect(result.users).toEqual([
      expect.objectContaining({
        id: 'client-user-1',
        email: 'jane@example.com',
        isCurrentUser: true,
        isPrimaryContact: true,
        permissions: expect.objectContaining({
          canViewProjects: true,
          canViewInvoices: true,
          canApproveWork: true,
          canViewAnalytics: true,
          canSubmitRequests: true
        })
      }),
      expect.objectContaining({
        id: 'client-user-2',
        status: 'pending',
        isCurrentUser: false,
        permissions: expect.objectContaining({
          canViewInvoices: false,
          canSubmitRequests: false
        })
      })
    ])
  })
})
