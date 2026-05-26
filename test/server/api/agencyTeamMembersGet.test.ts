import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(fn: T) => T
}

testGlobal.eventHandler = fn => fn

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockGetQuery = vi.fn()

vi.mock('h3', () => ({
  getQuery: (...args: unknown[]) => mockGetQuery(...args),
  createError: (opts: { statusCode: number, statusMessage: string }) => {
    const error = new Error(opts.statusMessage) as Error & {
      statusCode: number
      statusMessage: string
    }
    error.statusCode = opts.statusCode
    error.statusMessage = opts.statusMessage
    return error
  }
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/agency/team-members.get'
)

function fakeEvent(query: Record<string, string> = {}) {
  return { query } satisfies TestEvent
}

describe('GET /api/agency/team-members', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryRows.mockReset()
    mockGetQuery.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockGetQuery.mockImplementation((event: TestEvent) => event.query ?? {})
  })

  it('returns team members with metrics using the current team schema', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'member-1',
        name: 'Alicia Karitsas',
        email: 'alicia@example.com',
        role: 'member',
        department: 'Production',
        hourly_rate: '150.00',
        hourly_cost: 0,
        target_utilization: '120.00',
        avatar_url: 'https://example.com/avatar.jpg',
        is_active: true,
        hours_this_month: '20.5',
        billable_hours_this_month: '18.0',
        utilization_rate: '15.0',
        active_projects: '3',
        created_at: '2026-05-25T00:00:00.000Z'
      }
    ])

    const result = await handler(fakeEvent({ active: 'true' }))

    expect(result.members[0]).toMatchObject({
      id: 'member-1',
      department: 'Production',
      hourlyRate: 150,
      hoursThisMonth: 20.5,
      billableHoursThisMonth: 18,
      utilizationRate: 15,
      activeProjects: 3
    })
    expect(result.summary).toMatchObject({
      total: 1,
      active: 1,
      totalCapacity: 120,
      totalBillableHours: 18,
      avgUtilization: 15
    })
    expect(result.departments).toEqual(['Production'])
    expect(result.roles).toEqual(['member'])

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('LEFT JOIN departments d ON d.id = tm.department_id')
    expect(sql).toContain('d.name AS department')
    expect(sql).toContain('tm.default_hourly_rate AS hourly_rate')
    expect(sql).toContain('tm.user_role::text')
    expect(sql).not.toMatch(/\btm\.department\b/)
    expect(sql).not.toContain('tm.hourly_rate')
  })
})
