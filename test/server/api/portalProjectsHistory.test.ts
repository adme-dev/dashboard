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
    mockRequireClientAuth.mockResolvedValue({ clientId: 'client-1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({
      total: '0',
      active: '0',
      completed: '0',
      on_hold: '0',
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
        pending_approvals: '0',
        deliverable_count: '1'
      }
    ])
    mockQueryOne.mockResolvedValueOnce({
      total: '3',
      active: '1',
      completed: '1',
      on_hold: '0',
      upcoming: '2',
      history: '1'
    })

    const result = await projectsHandler({ query: { view: 'upcoming' } })

    expect(result.summary).toMatchObject({ upcoming: 2, history: 1 })
    expect(result.projects[0]).toMatchObject({
      id: 'job-1',
      name: 'June campaign',
      startDate: '2026-06-01',
      dueDate: '2026-06-30'
    })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('p.status IN (\'draft\', \'active\', \'on_hold\')')
    expect(sql).toContain('(p.due_date IS NULL OR p.due_date >= CURRENT_DATE)')
    expect(sql).toContain('COALESCE($3, \'\') <> \'history\'')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 50, 'upcoming'])
  })

  it('returns completed and cancelled jobs as client job history', async () => {
    await projectsHandler({ query: { view: 'history', limit: '25' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('p.status IN (\'completed\', \'cancelled\')')
    expect(sql).toContain('CASE WHEN $3 = \'history\' THEN p.due_date END DESC NULLS LAST')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 25, 'history'])
  })
})
