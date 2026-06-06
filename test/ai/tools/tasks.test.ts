import { describe, it, expect, vi } from 'vitest'
import { getTasks, type TasksDeps, type TaskRow } from '~~/server/utils/ai/tools/tasks'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
  userId: 'me-1',
  userRole: 'owner',
  event: {} as any,
  ...over,
})

const row = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: 't1',
  title: 'Design homepage',
  status: 'In Progress',
  assignee: 'Alice',
  due: '2026-06-10',
  project: 'Acme Rebrand',
  ...over,
})

describe('get_tasks', () => {
  it('SECURITY: a non-manager role requesting scope:all is forced to own-only', async () => {
    const fetchTasks = vi.fn<[any], Promise<TaskRow[]>>().mockResolvedValue([])
    const deps: TasksDeps = { fetchTasks }

    await getTasks({ scope: 'all' }, ctx({ userRole: 'creative' }), deps)

    expect(fetchTasks).toHaveBeenCalledTimes(1)
    const filter = fetchTasks.mock.calls[0]![0]
    // The handler must collapse 'all' → 'mine' and pin the query to the caller's id.
    expect(filter.scope).toBe('mine')
    expect(filter.assigneeId).toBe('me-1')
  })

  it('SECURITY: a non-manager defaulting to scope:mine is still pinned to own-only', async () => {
    const fetchTasks = vi.fn<[any], Promise<TaskRow[]>>().mockResolvedValue([])
    const deps: TasksDeps = { fetchTasks }

    await getTasks({ scope: 'mine' }, ctx({ userRole: 'media_buyer' }), deps)

    const filter = fetchTasks.mock.calls[0]![0]
    expect(filter.scope).toBe('mine')
    expect(filter.assigneeId).toBe('me-1')
  })

  it('a manager (owner) with scope:all is NOT restricted to own', async () => {
    const fetchTasks = vi.fn<[any], Promise<TaskRow[]>>().mockResolvedValue([])
    const deps: TasksDeps = { fetchTasks }

    await getTasks({ scope: 'all' }, ctx({ userRole: 'owner' }), deps)

    const filter = fetchTasks.mock.calls[0]![0]
    expect(filter.scope).toBe('all')
    expect(filter.assigneeId).toBeUndefined()
  })

  it('a manager (project_manager) requesting scope:mine is still own-scoped', async () => {
    const fetchTasks = vi.fn<[any], Promise<TaskRow[]>>().mockResolvedValue([])
    const deps: TasksDeps = { fetchTasks }

    await getTasks({ scope: 'mine' }, ctx({ userRole: 'project_manager' }), deps)

    const filter = fetchTasks.mock.calls[0]![0]
    expect(filter.scope).toBe('mine')
    expect(filter.assigneeId).toBe('me-1')
  })

  it('forwards status / overdue / projectOrClientName filters to deps', async () => {
    const fetchTasks = vi.fn<[any], Promise<TaskRow[]>>().mockResolvedValue([])
    const deps: TasksDeps = { fetchTasks }

    await getTasks(
      { scope: 'all', status: 'Blocked', overdue: true, projectOrClientName: 'Acme' },
      ctx({ userRole: 'admin' }),
      deps,
    )

    const filter = fetchTasks.mock.calls[0]![0]
    expect(filter.status).toBe('Blocked')
    expect(filter.overdue).toBe(true)
    expect(filter.projectOrClientName).toBe('Acme')
  })

  it('returns a compact projection capped at 20 with a more count', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => row({ id: `t${i}`, title: `Task ${i}` }))
    const fetchTasks = vi.fn<[any], Promise<TaskRow[]>>().mockResolvedValue(rows)
    const deps: TasksDeps = { fetchTasks }

    const res = await getTasks({ scope: 'all' }, ctx({ userRole: 'owner' }), deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.tasks).toHaveLength(20)
    expect(data.more).toBe(5)
    // compact shape: only the projected keys
    expect(Object.keys(data.tasks[0]).sort()).toEqual(['assignee', 'due', 'project', 'status', 'title'])
    expect(data.tasks[0]).toEqual({
      title: 'Task 0',
      status: 'In Progress',
      assignee: 'Alice',
      due: '2026-06-10',
      project: 'Acme Rebrand',
    })
  })

  it('reports more:0 when at or under the cap', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row({ id: `t${i}` }))
    const fetchTasks = vi.fn<[any], Promise<TaskRow[]>>().mockResolvedValue(rows)
    const deps: TasksDeps = { fetchTasks }

    const res = await getTasks({ scope: 'mine' }, ctx({ userRole: 'owner' }), deps)
    const data = (res as any).data
    expect(data.tasks).toHaveLength(3)
    expect(data.more).toBe(0)
  })

  it('returns a recoverable error (never throws) when the source fails', async () => {
    const fetchTasks = vi.fn<[any], Promise<TaskRow[]>>().mockRejectedValue(new Error('db down'))
    const deps: TasksDeps = { fetchTasks }

    const res = await getTasks({ scope: 'mine' }, ctx({ userRole: 'owner' }), deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/task/i)
  })
})
