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
const mockEnsureOfficeRecordingsTables = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: (...args: unknown[]) => mockEnsureOfficeRecordingsTables(...args)
}))

const { default: clientsHandler } = await import(
  '../../../../server/api/agency/client-portal/clients.get'
)

describe('agency client portal clients API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'agency-user-1', role: 'media_buyer' })
    mockQueryRows.mockResolvedValue([])
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)
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
      history_jobs: '17',
      total_invoices: '7',
      outstanding_invoices: '2',
      overdue_invoices: '1',
      outstanding_amount: '3000',
      overdue_amount: '1200',
      paid_invoices: '5',
      open_requests: '6',
      urgent_requests: '2',
      unassigned_requests: '3',
      job_requests: '4',
      support_requests: '5',
      campaign_count: '11',
      campaign_platforms: '2',
      campaign_spend_90d: '9876.5',
      campaign_last_synced_at: '2026-05-27T02:00:00Z',
      visible_meetings: '9',
      upcoming_meetings: '3',
      meeting_recordings: '4'
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
      totalInvoices: 7,
      outstandingInvoices: 2,
      overdueInvoices: 1,
      outstandingAmount: 3000,
      overdueAmount: 1200,
      paidInvoices: 5,
      openRequests: 6,
      urgentRequests: 2,
      unassignedRequests: 3,
      jobRequests: 4,
      supportRequests: 5,
      campaignCount: 11,
      campaignPlatforms: 2,
      campaignSpend90d: 9876.5,
      campaignLastSyncedAt: '2026-05-27T02:00:00Z',
      visibleMeetings: 9,
      upcomingMeetings: 3,
      meetingRecordings: 4,
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
    expect(sql).toContain('FROM invoices')
    expect(sql).toContain('COUNT(*) FILTER (WHERE status IN (\'sent\', \'overdue\')) AS outstanding_invoices')
    expect(sql).toContain('SUM(CASE WHEN status = \'overdue\' THEN total_amount - amount_paid ELSE 0 END)')
    expect(sql).toContain('FROM client_requests')
    expect(sql).toContain('COUNT(*) FILTER (WHERE status IN (\'submitted\', \'in_review\', \'approved\', \'in_progress\')) AS open_requests')
    expect(sql).toContain('AND priority = \'urgent\'')
    expect(sql).toContain('AND assigned_to IS NULL')
    expect(sql).toContain('FROM media_spend')
    expect(sql).toContain('COUNT(DISTINCT COALESCE(NULLIF(campaign_id, \'\'), id::text)) AS campaign_count')
    expect(sql).toContain('COUNT(DISTINCT platform) AS campaign_platforms')
    expect(sql).toContain('SUM(actual_spend)')
    expect(sql).toContain('JOIN office_members om ON om.client_user_id = cu.id')
    expect(sql).toContain('JOIN office_meeting_sessions oms ON oms.office_id = om.office_id')
    expect(sql).toContain('COUNT(DISTINCT rec.id) FILTER (WHERE rec.status = \'ready\')')
    expect(sql).toContain('COALESCE(cu.portal_users, 0) > 0')
    expect(sql).toContain('c.name ILIKE $1')
    expect(params).toEqual(['%Client%', 100])
    expect(mockEnsureOfficeRecordingsTables).toHaveBeenCalledOnce()
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
        'Route lead forms to the portal',
        'Share client meetings or recordings'
      ]
    })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('COALESCE(cu.portal_users, 0) = 0')
  })
})
