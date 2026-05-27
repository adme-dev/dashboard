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

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: dashboardHandler } = await import(
  '../../../../server/api/agency/client-portal/dashboard.get'
)

describe('agency client portal dashboard API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'agency-user-1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'client-1',
        name: 'Client One',
        logo_url: null,
        status: 'active',
        billing_type: 'retainer',
        retainer_amount: '5000',
        created_at: '2026-05-01T00:00:00Z'
      })
      .mockResolvedValueOnce({ total: '3', active: '1', completed: '1', on_hold: '1' })
      .mockResolvedValueOnce({ total: '4', paid: '2', outstanding: '2', total_paid: '6000', total_outstanding: '2000' })
      .mockResolvedValueOnce({ total_deliverables: '7', approved: '4', featured: '2', collections: '1' })
      .mockResolvedValueOnce({
        open_requests: '5',
        urgent_requests: '1',
        unassigned_requests: '2',
        overdue_requests: '1',
        open_requested_budget: '12000'
      })
      .mockResolvedValueOnce({
        leads_last_30: '18',
        uncontacted_leads_last_30: '4',
        won_leads_last_30: '3',
        avg_response_minutes_last_30: '37.8'
      })
      .mockResolvedValueOnce({
        total_users: '6',
        active_users: '4',
        pending_users: '1',
        agency_access_users: '1',
        last_login_at: '2026-05-28T00:00:00Z'
      })
      .mockResolvedValueOnce({
        overdue_invoices: '1',
        due_next_7_count: '2',
        due_next_7_amount: '1500',
        paid_last_90: '9000',
        avg_days_to_pay: '14.4'
      })
      .mockResolvedValueOnce({
        briefs_total: '8',
        briefs_open: '3',
        briefs_needs_info: '1',
        briefs_urgent: '2',
        briefs_overdue: '1',
        briefs_submitted_30d: '4',
        deliverables_visible: '11',
        deliverables_approved: '7',
        deliverables_final: '5',
        deliverables_recent_30d: '6',
        last_published_at: '2026-05-27T01:00:00Z'
      })
  })

  it('returns enterprise operating health for an agency-opened client portal', async () => {
    const result = await dashboardHandler({ query: { clientId: 'client-1' } })

    expect(result.client).toMatchObject({
      id: 'client-1',
      name: 'Client One',
      retainerAmount: 5000
    })
    expect(result.enterprise).toEqual({
      requests: {
        open: 5,
        urgent: 1,
        unassigned: 2,
        overdue: 1,
        openRequestedBudget: 12000
      },
      leads: {
        leadsLast30: 18,
        uncontactedLast30: 4,
        wonLast30: 3,
        avgResponseMinutesLast30: 38
      },
      access: {
        totalUsers: 6,
        activeUsers: 4,
        pendingUsers: 1,
        agencyAccessUsers: 1,
        lastLoginAt: '2026-05-28T00:00:00Z'
      },
      billing: {
        overdueInvoices: 1,
        dueNext7Count: 2,
        dueNext7Amount: 1500,
        paidLast90: 9000,
        averageDaysToPay: 14
      },
      content: {
        briefsTotal: 8,
        briefsOpen: 3,
        briefsNeedsInfo: 1,
        briefsUrgent: 2,
        briefsOverdue: 1,
        briefsSubmitted30d: 4,
        deliverablesVisible: 11,
        deliverablesApproved: 7,
        deliverablesFinal: 5,
        deliverablesRecent30d: 6,
        lastPublishedAt: '2026-05-27T01:00:00Z'
      }
    })

    const leadSql = String(mockQueryOne.mock.calls[5]?.[0])
    const accessSql = String(mockQueryOne.mock.calls[6]?.[0])
    const billingSql = String(mockQueryOne.mock.calls[7]?.[0])
    const contentSql = String(mockQueryOne.mock.calls[8]?.[0])
    expect(leadSql).toContain('JOIN lead_form_destinations d ON d.rule_id = r.id')
    expect(leadSql).toContain('avg_response_minutes_last_30')
    expect(accessSql).toContain('agency_access_users')
    expect(billingSql).toContain('due_next_7_amount')
    expect(contentSql).toContain('FROM briefs')
    expect(contentSql).toContain('briefs_needs_info')
    expect(contentSql).toContain('requested_deadline < CURRENT_DATE')
    expect(contentSql).toContain('FROM client_deliverables')
    expect(contentSql).toContain('deliverables_recent_30d')
    expect(contentSql).toContain('last_published_at')
  })
})
