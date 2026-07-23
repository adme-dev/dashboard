import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.params?.[key]
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

const { default: projectDetailHandler } = await import(
  '../../../../server/api/portal/projects/[id].get'
)

describe('portal project detail job history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ clientId: 'client-1' })
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'project-1',
        name: 'Winter campaign',
        status: 'active',
        start_date: '2026-06-01',
        due_date: '2026-06-30',
        budget: '5000'
      })
      .mockResolvedValueOnce({
        total: '3',
        completed: '1',
        in_progress: '2'
      })
      .mockResolvedValueOnce({
        show_task_details: true,
        show_team_members: true,
        show_comments: true
      })

    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'task-upcoming',
          title: 'Launch ads',
          start_date: '2026-06-10',
          due_date: '2026-06-12',
          priority: 'high',
          task_type: 'task',
          status_name: 'In Progress',
          status_color: '#2563eb',
          assignee_name: 'Ava PM',
          assignee_avatar: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'task-complete',
          title: 'Creative QA',
          due_date: '2026-06-05',
          completed_at: '2026-06-04T23:00:00.000Z',
          priority: 'medium',
          task_type: 'review',
          status_name: 'Done',
          status_color: '#16a34a',
          assignee_name: 'Ava PM',
          assignee_avatar: null
        }
      ])
      .mockResolvedValue([])
  })

  it('returns upcoming work and completed job history for the selected client project', async () => {
    const result = await projectDetailHandler({ params: { id: 'project-1' } })

    expect(result.upcomingTasks[0]).toMatchObject({
      id: 'task-upcoming',
      title: 'Launch ads',
      dueDate: '2026-06-12',
      assignee: { name: 'Ava PM' }
    })
    expect(result.completedTasks[0]).toMatchObject({
      id: 'task-complete',
      title: 'Creative QA',
      completedAt: '2026-06-04T23:00:00.000Z',
      assignee: { name: 'Ava PM' }
    })

    const upcomingSql = String(mockQueryRows.mock.calls[0]?.[0])
    const completedSql = String(mockQueryRows.mock.calls[1]?.[0])
    const teamSql = mockQueryRows.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes('FROM team_members tm'))

    expect(upcomingSql).toContain('AND t.status_is_final = false')
    expect(upcomingSql).toContain('ORDER BY t.due_date ASC NULLS LAST')
    expect(completedSql).toContain('AND t.status_is_final = true')
    expect(completedSql).toContain('ORDER BY t.completed_at DESC NULLS LAST')
    expect(teamSql).toContain('LEFT JOIN departments d ON d.id = tm.department_id')
    expect(teamSql).toContain('d.name AS department')
    expect(teamSql).not.toMatch(/\btm\.department\b/)
  })
})
