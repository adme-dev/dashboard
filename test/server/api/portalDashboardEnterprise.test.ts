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
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: vi.fn()
}))

vi.mock('~~/server/utils/officeRecordings', () => ({
  ensureOfficeRecordingsTables: vi.fn()
}))

const { default: dashboardHandler } = await import(
  '../../../../server/api/portal/dashboard.get'
)

describe('portal dashboard enterprise summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: {
        canViewInvoices: true,
        canViewAnalytics: true
      }
    })

    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({})
  })

  it('returns enterprise jobs, billing, campaign, and access health from existing platform tables', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'client-1', name: 'Client Co' })
      .mockResolvedValueOnce({ total: '2', active: '1', completed: '1', on_hold: '0' })
      .mockResolvedValueOnce({ total: '2', paid: '1', outstanding: '1', total_paid: '900', total_outstanding: '300' })
      .mockResolvedValueOnce({ total: '3', submitted: '1', needs_review: '2', in_progress: '1', open: '2', resolved: '1' })
      .mockResolvedValueOnce({
        active_jobs: '3',
        overdue_jobs: '1',
        due_soon_jobs: '2',
        completed_last_30: '4',
        next_due_date: '2026-06-01'
      })
      .mockResolvedValueOnce({
        outstanding_count: '2',
        overdue_count: '1',
        outstanding_amount: '1200.50',
        aged_60_amount: '250',
        aged_60_count: '1',
        paid_last_90: '5400',
        last_paid_at: '2026-05-20',
        next_due_date: '2026-06-05'
      })
      .mockResolvedValueOnce({
        campaigns: '6',
        platforms: '2',
        spend: '3000',
        impressions: '120000',
        clicks: '1800',
        conversions: '90',
        last_synced_at: '2026-05-27T00:00:00.000Z'
      })
      .mockResolvedValueOnce({
        visible_leads: '80',
        leads_last_30: '20',
        won_leads: '5'
      })
      .mockResolvedValueOnce({
        total_users: '4',
        active_users: '3',
        pending_users: '1',
        last_login_at: '2026-05-26T00:00:00.000Z'
      })
      .mockResolvedValueOnce({ total: '80', new: '10', contacted: '20', won: '5' })

    mockQueryRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'project-upcoming',
          name: 'Upcoming campaign',
          status: 'active',
          start_date: '2026-06-01',
          due_date: '2026-06-15',
          budget: '5000',
          total_tasks: '8',
          completed_tasks: '2'
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'project-complete',
          name: 'Completed campaign',
          status: 'completed',
          start_date: '2026-05-01',
          due_date: '2026-05-20',
          budget: '4000',
          updated_at: '2026-05-21T00:00:00.000Z',
          total_tasks: '6',
          completed_tasks: '6'
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'meeting-1',
          office_id: 'office-1',
          office_name: 'Client Office',
          title: 'Monthly review',
          status: 'planned',
          source: 'scheduled',
          started_at: null,
          ended_at: null,
          created_at: '2026-05-27T00:00:00.000Z',
          scheduled_start_at: '2026-06-01T00:00:00.000Z',
          duration_minutes: '30',
          zone_name: 'Meeting Room',
          zone_slug: 'meeting-room',
          ready_recording_count: '1',
          latest_recording_token: 'recording-token'
        }
      ])

    const result = await dashboardHandler({})

    expect(result.projects.upcoming).toEqual([
      {
        id: 'project-upcoming',
        name: 'Upcoming campaign',
        status: 'active',
        startDate: '2026-06-01',
        dueDate: '2026-06-15',
        budget: 5000,
        totalTasks: 8,
        completedTasks: 2
      }
    ])
    expect(result.projects.completedRecent).toEqual([
      {
        id: 'project-complete',
        name: 'Completed campaign',
        status: 'completed',
        startDate: '2026-05-01',
        dueDate: '2026-05-20',
        budget: 4000,
        completedAt: '2026-05-21T00:00:00.000Z',
        totalTasks: 6,
        completedTasks: 6
      }
    ])

    expect(result.requests.stats).toEqual({
      total: 3,
      submitted: 1,
      needsReview: 2,
      inProgress: 1,
      open: 2,
      resolved: 1
    })

    expect(result.enterprise).toEqual({
      jobs: {
        active: 3,
        overdue: 1,
        dueSoon: 2,
        completedLast30: 4,
        nextDueDate: '2026-06-01'
      },
      billing: {
        outstandingCount: 2,
        overdueCount: 1,
        outstandingAmount: 1200.5,
        aged60Amount: 250,
        aged60Count: 1,
        paidLast90: 5400,
        lastPaidAt: '2026-05-20',
        nextDueDate: '2026-06-05'
      },
      campaigns: {
        campaigns: 6,
        platforms: 2,
        spend: 3000,
        impressions: 120000,
        clicks: 1800,
        conversions: 90,
        leadsLast30: 20,
        visibleLeads: 80,
        wonLeads: 5,
        costPerLead: 150,
        lastSyncedAt: '2026-05-27T00:00:00.000Z'
      },
      access: {
        totalUsers: 4,
        activeUsers: 3,
        pendingUsers: 1,
        lastLoginAt: '2026-05-26T00:00:00.000Z'
      }
    })
    expect(result.meetings.upcoming[0]).toMatchObject({
      id: 'meeting-1',
      officeId: 'office-1',
      title: 'Monthly review',
      joinPath: '/lobby/office-1?meeting=meeting-1',
      durationMinutes: 30,
      readyRecordingCount: 1,
      latestRecordingToken: 'recording-token'
    })

    const campaignSql = String(mockQueryOne.mock.calls[6]?.[0])
    expect(campaignSql).toContain('FROM media_spend ms')
    expect(campaignSql).toContain('ad_account_client_map')
    expect(campaignSql).toContain('TO_CHAR(CURRENT_DATE - INTERVAL \'90 days\', \'YYYY-MM\')')

    const upcomingJobsSql = String(mockQueryRows.mock.calls[1]?.[0])
    const completedJobsSql = String(mockQueryRows.mock.calls[2]?.[0])
    const portalAccessSql = String(mockQueryOne.mock.calls[8]?.[0])
    expect(upcomingJobsSql).toContain('p.status IN (\'draft\', \'active\', \'on_hold\')')
    expect(completedJobsSql).toContain('p.status IN (\'completed\', \'cancelled\')')
    expect(portalAccessSql).toContain('email NOT LIKE \'%@portal-access.local\'')
  })
})
