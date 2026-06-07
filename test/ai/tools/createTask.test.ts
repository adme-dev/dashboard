import { describe, it, expect, vi } from 'vitest'
import { proposeCreateTask, type CreateTaskDeps } from '~~/server/utils/ai/tools/createTask'

const ctx = (over: Partial<{ userRole: string, conversationId?: string }> = {}) => ({
  userId: 'u1', userRole: over.userRole ?? 'account_manager',
  conversationId: 'conversationId' in over ? over.conversationId : 'c1',
  event: {} as any,
})

const mkDeps = (over: Partial<CreateTaskDeps> = {}): CreateTaskDeps => ({
  resolveDepartment: vi.fn().mockResolvedValue([{ id: 'd1', name: 'Creative' }]),
  resolveProject: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Acme Rebrand' }]),
  resolveAssignee: vi.fn().mockResolvedValue([{ id: 'm1', name: 'Sam' }]),
  propose: vi.fn().mockResolvedValue('prop-1'),
  ...over,
})

describe('proposeCreateTask (Option B — propose only)', () => {
  it('resolves names→ids, persists a proposal, and returns it WITHOUT creating a task', async () => {
    const deps = mkDeps()
    const res = await proposeCreateTask(
      { title: 'Follow up with Acme', boardName: 'Creative', projectName: 'Acme', assigneeName: 'Sam', dueDate: '2026-06-10' },
      ctx() as any, deps,
    )
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.proposalId).toBe('prop-1')
    expect(data.resolved.departmentId).toBe('d1')
    expect(data.resolved.projectId).toBe('p1')
    expect(data.resolved.assigneeId).toBe('m1')
    expect(data.resolved.title).toBe('Follow up with Acme')
    expect(deps.propose).toHaveBeenCalledTimes(1)
  })

  it('blocks read-only roles (no proposal persisted)', async () => {
    const deps = mkDeps()
    const res = await proposeCreateTask({ title: 'X', boardName: 'Creative' }, ctx({ userRole: 'viewer' }) as any, deps)
    expect(res.ok).toBe(false)
    expect(deps.propose).not.toHaveBeenCalled()
  })

  it('asks for a board when none is given (cannot create without a department)', async () => {
    const deps = mkDeps()
    const res = await proposeCreateTask({ title: 'X' }, ctx() as any, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/board|department/i)
    expect(deps.propose).not.toHaveBeenCalled()
  })

  it('returns a disambiguation list when the board matches multiple (no proposal)', async () => {
    const deps = mkDeps({ resolveDepartment: vi.fn().mockResolvedValue([{ id: 'd1', name: 'Creative' }, { id: 'd2', name: 'Creative Ops' }]) })
    const res = await proposeCreateTask({ title: 'X', boardName: 'Creative' }, ctx() as any, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.disambiguation.field).toBe('boardName')
    expect((res as any).data.disambiguation.options).toHaveLength(2)
    expect(deps.propose).not.toHaveBeenCalled()
  })

  it('refuses to prepare a task outside a conversation', async () => {
    const deps = mkDeps()
    const res = await proposeCreateTask({ title: 'X', boardName: 'Creative' }, ctx({ conversationId: undefined }) as any, deps)
    expect(res.ok).toBe(false)
    expect(deps.propose).not.toHaveBeenCalled()
  })
})
