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
      contacted_leads_30d: '8',
      uncontacted_leads_30d: '3',
      won_leads_30d: '2',
      avg_response_minutes_30d: '42.4',
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
      briefs_total: '9',
      briefs_open: '3',
      briefs_needs_info: '1',
      briefs_urgent: '2',
      briefs_overdue: '1',
      briefs_submitted_30d: '4',
      deliverables_visible: '12',
      deliverables_approved: '8',
      deliverables_final: '5',
      deliverables_recent_30d: '6',
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
      readinessScore: 88,
      setupGaps: ['Review uncontacted portal leads'],
      pendingApprovals: 4,
      portalLeads30d: 12,
      newLeads30d: 5,
      contactedLeads30d: 8,
      uncontactedLeads30d: 3,
      wonLeads30d: 2,
      avgResponseMinutes30d: 42,
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
      briefsTotal: 9,
      briefsOpen: 3,
      briefsNeedsInfo: 1,
      briefsUrgent: 2,
      briefsOverdue: 1,
      briefsSubmitted30d: 4,
      deliverablesVisible: 12,
      deliverablesApproved: 8,
      deliverablesFinal: 5,
      deliverablesRecent30d: 6,
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
    expect(sql).toContain('contacted_leads_30d')
    expect(sql).toContain('uncontacted_leads_30d')
    expect(sql).toContain('avg_response_minutes_30d')
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
    expect(sql).toContain('FROM briefs')
    expect(sql).toContain('COUNT(*) FILTER (WHERE status = \'needs_info\') AS briefs_needs_info')
    expect(sql).toContain('requested_deadline < CURRENT_DATE')
    expect(sql).toContain('COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL \'30 days\') AS briefs_submitted_30d')
    expect(sql).toContain('FROM client_deliverables')
    expect(sql).toContain('COUNT(*) FILTER (WHERE is_visible_to_client = true) AS deliverables_visible')
    expect(sql).toContain('COUNT(*) FILTER (WHERE is_final = true) AS deliverables_final')
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

  it('filters clients by operational portal risk', async () => {
    await clientsHandler({ query: { status: 'risk' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('COALESCE(inv.overdue_invoices, 0) > 0')
    expect(sql).toContain('COALESCE(req.urgent_requests, 0) > 0')
    expect(sql).toContain('COALESCE(req.unassigned_requests, 0) > 0')
    expect(sql).toContain('COALESCE(br.briefs_urgent, 0) > 0')
    expect(sql).toContain('COALESCE(br.briefs_overdue, 0) > 0')
    expect(sql).toContain('COALESCE(ld.uncontacted_leads_30d, 0) > 0')
    expect(sql).toContain('COALESCE(campaigns.campaign_count, 0) = 0')
    expect(sql).toContain('COALESCE(dl.deliverables_visible, 0) = 0')
    expect(sql).toContain('COALESCE(mt.visible_meetings, 0) = 0')
    expect(sql).toContain('(COALESCE(inv.overdue_invoices, 0) * 4)')
    expect(sql).toContain('(COALESCE(req.urgent_requests, 0) * 4)')
    expect(sql).toContain('(COALESCE(br.briefs_urgent, 0) * 3)')
    expect(sql).toContain('(COALESCE(br.briefs_overdue, 0) * 3)')
    expect(sql).toContain('(COALESCE(ld.uncontacted_leads_30d, 0) * 3)')
    expect(sql).toContain('CASE WHEN COALESCE(campaigns.campaign_count, 0) = 0 THEN 3 ELSE 0 END')
    expect(sql).toContain('CASE WHEN COALESCE(dl.deliverables_visible, 0) = 0 THEN 2 ELSE 0 END')
  })

  it('filters clients by lead response risk', async () => {
    await clientsHandler({ query: { status: 'lead-risk' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('COALESCE(ld.uncontacted_leads_30d, 0) > 0')
    expect(sql).toContain('COALESCE(ld.avg_response_minutes_30d, 0) > 240')
    expect(sql).toContain('ORDER BY COALESCE(ld.uncontacted_leads_30d, 0) DESC, COALESCE(ld.avg_response_minutes_30d, 0) DESC, c.name')
  })

  it('filters clients by specific setup gaps', async () => {
    await clientsHandler({ query: { status: 'missing-campaigns' } })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('COALESCE(campaigns.campaign_count, 0) = 0')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('ORDER BY COALESCE(campaigns.campaign_spend_90d, 0) ASC, c.name')

    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'agency-user-1', role: 'media_buyer' })
    mockQueryRows.mockResolvedValue([])
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)

    await clientsHandler({ query: { status: 'missing-meetings' } })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('COALESCE(mt.visible_meetings, 0) = 0')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('ORDER BY COALESCE(cu.active_users, 0) DESC, c.name')

    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'agency-user-1', role: 'media_buyer' })
    mockQueryRows.mockResolvedValue([])
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)

    await clientsHandler({ query: { status: 'missing-content' } })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('(COALESCE(br.briefs_open, 0) > 0 OR COALESCE(dl.deliverables_visible, 0) = 0)')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('ORDER BY COALESCE(br.briefs_open, 0) DESC, COALESCE(dl.deliverables_visible, 0) ASC, c.name')
  })

  it('orders billing and request risk filters by severity', async () => {
    await clientsHandler({ query: { status: 'billing-risk' } })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('ORDER BY COALESCE(inv.overdue_amount, 0) DESC, COALESCE(inv.overdue_invoices, 0) DESC, c.name')

    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'agency-user-1', role: 'media_buyer' })
    mockQueryRows.mockResolvedValue([])
    mockEnsureOfficeRecordingsTables.mockResolvedValue(undefined)

    await clientsHandler({ query: { status: 'request-risk' } })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('ORDER BY COALESCE(req.urgent_requests, 0) DESC, COALESCE(req.unassigned_requests, 0) DESC, c.name')
  })
})
