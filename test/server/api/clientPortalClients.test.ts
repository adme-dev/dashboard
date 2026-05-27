import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: clientsHandler } = await import(
  '../../../../server/api/agency/client-portal/clients.get'
)

describe('agency client portal clients API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'agency-user-1', role: 'media_buyer' })
    mockQueryRows.mockResolvedValue([])
  })

  it('lists clients with portal readiness and lead activity', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      id: 'client-1',
      name: 'Client One',
      logo_url: null,
      is_active: true,
      created_at: '2026-05-01T00:00:00Z',
      portal_users: '3',
      active_users: '2',
      pending_users: '1',
      agency_access_users: '1',
      project_access_users: '2',
      invoice_access_users: '1',
      approval_access_users: '1',
      analytics_access_users: '2',
      request_access_users: '2',
      last_login_at: '2026-05-27T00:00:00Z',
      last_activity_at: '2026-05-27T01:00:00Z',
      pending_approvals: '4',
      portal_leads_30d: '12',
      new_leads_30d: '5',
      won_leads_30d: '2',
      active_projects: '6',
      upcoming_jobs: '8',
      history_jobs: '17'
    }])

    const result = await clientsHandler({
      query: { search: 'Client', status: 'configured' }
    })

    expect(result.clients).toEqual([expect.objectContaining({
      id: 'client-1',
      portalUsers: 3,
      activeUsers: 2,
      pendingUsers: 1,
      agencyAccessUsers: 1,
      moduleAccess: {
        projects: 2,
        invoices: 1,
        approvals: 1,
        analytics: 2,
        requests: 2
      },
      readinessScore: 100,
      setupGaps: [],
      pendingApprovals: 4,
      portalLeads30d: 12,
      newLeads30d: 5,
      wonLeads30d: 2,
      activeProjects: 6,
      upcomingJobs: 8,
      historyJobs: 17,
      portalStatus: 'active'
    })])

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    const params = mockQueryRows.mock.calls[0]?.[1]
    expect(sql).toContain('FROM agency_clients c')
    expect(sql).toContain('d.destination_type = \'portal\'')
    expect(sql).toContain('COUNT(*) FILTER (')
    expect(sql).toContain('can_view_projects = true')
    expect(sql).toContain('can_view_invoices = true')
    expect(sql).toContain('can_approve_work = true')
    expect(sql).toContain('COALESCE(can_view_analytics, true) = true')
    expect(sql).toContain('COALESCE(can_submit_requests, true) = true')
    expect(sql).toContain('status IN (\'draft\', \'active\', \'on_hold\')')
    expect(sql).toContain('status IN (\'completed\', \'cancelled\')')
    expect(sql).toContain('COALESCE(cu.portal_users, 0) > 0')
    expect(sql).toContain('c.name ILIKE $1')
    expect(params).toEqual(['%Client%', 100])
  })

  it('marks clients without users as not configured', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      id: 'client-2',
      name: 'Client Two',
      logo_url: null,
      is_active: true,
      created_at: '2026-05-01T00:00:00Z',
      portal_users: 0,
      active_users: 0,
      pending_users: 0
    }])

    const result = await clientsHandler({ query: { status: 'no-users' } })

    expect(result.clients[0]).toMatchObject({
      id: 'client-2',
      portalStatus: 'not_configured',
      readinessScore: 0,
      setupGaps: [
        'Invite a client portal user',
        'Add booked jobs or project history',
        'Enable billing visibility',
        'Enable campaign analytics visibility',
        'Enable request intake',
        'Route lead forms to the portal'
      ]
    })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('COALESCE(cu.portal_users, 0) = 0')
  })
})
