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

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: dashboardHandler } = await import(
  '../../../../server/api/portal/dashboard.get'
)

function fullAccess() {
  return {
    id: 'client-user-1',
    clientId: 'client-1',
    isPrimaryContact: true,
    permissions: {
      canViewProjects: true,
      canViewBudgets: true,
      canApproveWork: true,
      canViewInvoices: true,
      canViewAnalytics: true,
      canInviteUsers: true
    }
  }
}

describe('portal dashboard section budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue(fullAccess())
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({})
  })

  it('keeps the above-fold core dashboard within eight SQL operations', async () => {
    await dashboardHandler({ query: { section: 'core' } })
    expect(mockQueryOne.mock.calls.length + mockQueryRows.mock.calls.length).toBeLessThanOrEqual(8)
  })

  it('keeps operations within six SQL operations and uses canonical team columns', async () => {
    await dashboardHandler({ query: { section: 'operations' } })

    const allSql = [...mockQueryOne.mock.calls, ...mockQueryRows.mock.calls]
      .map(call => String(call[0]))
      .join('\n')
    const teamQuery = mockQueryRows.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes('FROM team_members tm'))

    expect(mockQueryOne.mock.calls.length + mockQueryRows.mock.calls.length).toBeLessThanOrEqual(6)
    expect(allSql).not.toContain('FROM client_activity_log')
    expect(teamQuery).toContain('LEFT JOIN departments d ON d.id = tm.department_id')
    expect(teamQuery).toContain('NULL::text AS phone')
    expect(teamQuery).toContain('d.name AS department')
    expect(teamQuery).not.toMatch(/\btm\.phone\b/)
    expect(teamQuery).not.toMatch(/\btm\.department\b/)
  })

  it('does not query or return project, approval, or invoice data without permission', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: {
        canViewProjects: false,
        canViewBudgets: false,
        canApproveWork: false,
        canViewInvoices: false,
        canViewAnalytics: false
      }
    })

    const result = await dashboardHandler({ query: { section: 'core' } })
    const sql = [...mockQueryOne.mock.calls, ...mockQueryRows.mock.calls]
      .map(call => String(call[0]))
      .join('\n')

    expect(sql).not.toContain('FROM invoices')
    expect(result.projects).toEqual({
      stats: { total: 0, active: 0, completed: 0, onHold: 0 },
      active: [],
      upcoming: [],
      completedRecent: []
    })
    expect(result.approvals).toEqual({ pending: [], pendingCount: 0 })
    expect(result.invoices.outstanding).toEqual([])
  })

  it('loads enterprise health in four queries with billing permission applied', async () => {
    mockQueryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('active_jobs')) {
        return {
          active_jobs: '3',
          overdue_jobs: '1',
          due_soon_jobs: '2',
          completed_last_30: '4',
          next_due_date: '2026-08-01'
        }
      }
      if (sql.includes('outstanding_count')) {
        return {
          outstanding_count: '2',
          overdue_count: '1',
          outstanding_amount: '1200.50'
        }
      }
      if (sql.includes('total_users')) {
        return { total_users: '4', active_users: '3', pending_users: '1' }
      }
      if (sql.includes('briefs_total')) {
        return { briefs_total: '7', briefs_open: '3', deliverables_visible: '12' }
      }
      return {}
    })

    const result = await dashboardHandler({ query: { section: 'enterprise' } })

    expect(mockQueryOne).toHaveBeenCalledTimes(4)
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(result.enterprise.jobs).toMatchObject({ active: 3, overdue: 1, dueSoon: 2 })
    expect(result.enterprise.billing).toMatchObject({
      outstandingCount: 2,
      overdueCount: 1,
      outstandingAmount: 1200.5
    })
    expect(result.enterprise.access).toMatchObject({ totalUsers: 4, activeUsers: 3 })
    expect(result.enterprise.content).toMatchObject({ briefsTotal: 7, deliverablesVisible: 12 })
  })

  it('sources portal dashboard billing from the tenant-scoped Xero invoice cache', async () => {
    await dashboardHandler({ query: { section: 'operations' } })

    const allSql = [...mockQueryOne.mock.calls, ...mockQueryRows.mock.calls]
      .map(call => String(call[0]))
      .join('\n')

    expect(allSql).toContain('FROM xero_invoices_cache')
    expect(allSql).toContain('FROM agency_clients')
    expect(allSql).toContain('xero_contact_id')
    expect(allSql).toContain('tenant_id')
    expect(allSql).toContain('amount_due_cents')
    expect(allSql).toContain('NOT EXISTS')
  })

  it('uses Xero paid and outstanding amounts for enterprise billing health', async () => {
    await dashboardHandler({ query: { section: 'enterprise' } })

    const billingSql = mockQueryOne.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes('outstanding_count'))

    expect(billingSql).toContain('xero_invoices_cache')
    expect(billingSql).toContain('amount_paid_cents')
    expect(billingSql).toContain('fully_paid_on_date')
    expect(billingSql).toContain('amount_due_cents')
    expect(billingSql).toContain('NOT EXISTS')
  })

  it('loads analytics health in four queries', async () => {
    mockQueryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(DISTINCT')) {
        return { campaigns: '6', platforms: '2', spend: '3000', conversions: '90' }
      }
      if (sql.includes('leads_last_30')) {
        return { leads_last_30: '20', visible_leads: '80' }
      }
      if (sql.includes('COUNT(CASE WHEN status')) {
        return { total: '80', new: '10', won: '5' }
      }
      return {}
    })

    const result = await dashboardHandler({ query: { section: 'analytics' } })

    expect(mockQueryOne.mock.calls.length + mockQueryRows.mock.calls.length).toBe(4)
    expect(result.enterprise.campaigns).toMatchObject({
      campaigns: 6,
      platforms: 2,
      spend: 3000,
      conversions: 90,
      leadsLast30: 20
    })
  })

  it('does not expose portal user health without user-management permission', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      ...fullAccess(),
      isPrimaryContact: false,
      permissions: {
        ...fullAccess().permissions,
        canInviteUsers: false
      }
    })

    const result = await dashboardHandler({ query: { section: 'enterprise' } })
    const sql = mockQueryOne.mock.calls.map(call => String(call[0])).join('\n')

    expect(sql).not.toContain('FROM client_users')
    expect(result.enterprise.access).toEqual({
      totalUsers: 0,
      activeUsers: 0,
      pendingUsers: 0,
      lastLoginAt: null
    })
  })

  it('does not query or return lead data without analytics permission', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      ...fullAccess(),
      permissions: {
        ...fullAccess().permissions,
        canViewAnalytics: false
      }
    })

    const result = await dashboardHandler({ query: { section: 'analytics' } })
    const sql = [...mockQueryOne.mock.calls, ...mockQueryRows.mock.calls]
      .map(call => String(call[0]))
      .join('\n')

    expect(sql).not.toContain('FROM leads')
    expect(result.leads).toEqual({
      stats: { total: 0, new: 0, contacted: 0, won: 0 },
      recent: []
    })
  })
})
