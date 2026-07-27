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

const { default: projectsHandler } = await import(
  '../../../../server/api/portal/projects/index.get'
)

describe('portal projects job history views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      clientId: 'client-1',
      permissions: { canViewProjects: true, canViewBudgets: true }
    })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({
      total: '0',
      active: '0',
      completed: '0',
      on_hold: '0',
      overdue: '0',
      due_soon: '0',
      next_due_date: null,
      completed_last_30: '0',
      upcoming: '0',
      history: '0'
    })
  })

  it('returns upcoming booked jobs using active-style statuses and future dates', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'job-1',
        name: 'June campaign',
        status: 'active',
        start_date: '2026-06-01',
        due_date: '2026-06-30',
        total_tasks: '4',
        completed_tasks: '1',
        in_progress_tasks: '2',
        overdue_tasks: '1',
        due_soon_tasks: '2',
        pending_approvals: '0',
        deliverable_count: '1'
      }
    ])
    mockQueryOne.mockResolvedValueOnce({
      total: '3',
      active: '1',
      completed: '1',
      on_hold: '0',
      overdue: '1',
      due_soon: '2',
      next_due_date: '2026-06-30',
      completed_last_30: '1',
      upcoming: '2',
      history: '1',
      total_budget: '15000',
      booked_budget: '11000',
      open_tasks: '9',
      overdue_tasks: '2',
      pending_approvals: '3',
      visible_deliverables: '7'
    })

    const result = await projectsHandler({ query: { view: 'upcoming' } })

    expect(result.summary).toMatchObject({
      upcoming: 2,
      history: 1,
      overdue: 1,
      dueSoon: 2,
      nextDueDate: '2026-06-30',
      completedLast30: 1
    })
    expect(result.summary).toMatchObject({
      totalBudget: 15000,
      bookedBudget: 11000,
      openTasks: 9,
      overdueTasks: 2,
      pendingApprovals: 3,
      visibleDeliverables: 7
    })
    expect(result.projects[0]).toMatchObject({
      id: 'job-1',
      name: 'June campaign',
      startDate: '2026-06-01',
      dueDate: '2026-06-30',
      overdueTasks: 1,
      dueSoonTasks: 2
    })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('p.status IN (\'draft\', \'active\', \'on_hold\')')
    expect(sql).toContain('(p.due_date IS NULL OR p.due_date >= CURRENT_DATE)')
    expect(sql).toContain('COALESCE($3, \'\') <> \'history\'')
    expect(sql).toContain('t.due_date < CURRENT_DATE')
    expect(sql).toContain('t.due_date <= CURRENT_DATE + INTERVAL \'14 days\'')
    expect(sql).toContain('JOIN projects scoped_projects ON scoped_projects.id = t.project_id')
    expect(sql).toContain('scoped_projects.client_id = $1')
    const summarySql = String(mockQueryOne.mock.calls[0]?.[0])
    expect(summarySql).toContain('due_date <= CURRENT_DATE + INTERVAL \'14 days\'')
    expect(summarySql).toContain('MIN(CASE')
    expect(summarySql).toContain('completed_last_30')
    expect(summarySql).toContain('SUM(CASE WHEN status IN (\'draft\', \'active\', \'on_hold\') THEN budget ELSE 0 END)')
    expect(summarySql).toContain('FROM client_deliverables cd')
    expect(summarySql).toContain('ca.status = \'pending\'')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 50, 'upcoming'])
  })

  it('returns completed and cancelled jobs as client job history', async () => {
    await projectsHandler({ query: { view: 'history', limit: '25' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('p.status IN (\'completed\', \'cancelled\')')
    expect(sql).toContain('CASE WHEN $3 = \'history\' THEN p.due_date END DESC NULLS LAST')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 25, 'history'])
  })

  it('rejects users without project access before reading project data', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      clientId: 'client-1',
      permissions: { canViewProjects: false, canViewBudgets: false }
    })

    await expect(projectsHandler({ query: {} })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'You do not have permission to view projects'
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('redacts project and summary budgets when budget access is disabled', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      clientId: 'client-1',
      permissions: { canViewProjects: true, canViewBudgets: false }
    })
    mockQueryRows.mockResolvedValueOnce([{
      id: 'job-1',
      name: 'Restricted job',
      budget: '12000',
      total_tasks: '0',
      completed_tasks: '0'
    }])
    mockQueryOne.mockResolvedValueOnce({
      total: '1',
      total_budget: '12000',
      booked_budget: '12000'
    })

    const result = await projectsHandler({ query: {} })

    expect(result.projects[0]?.budget).toBeNull()
    expect(result.summary.totalBudget).toBeNull()
    expect(result.summary.bookedBudget).toBeNull()
  })
})
