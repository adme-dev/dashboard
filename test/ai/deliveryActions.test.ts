import { describe, it, expect, vi } from 'vitest'
import {
  proposeAssignTask, proposeStatusChange, proposeBriefConvert, type DeliveryDeps,
} from '~~/server/utils/ai/tools/deliveryActions'
import {
  makeAssignTaskExecutor, makeStatusChangeExecutor, makeBriefConvertExecutor,
} from '~~/server/utils/ai/executors/deliveryActions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'account_manager', conversationId: 'c1', event: { headers: {} } as any } as ToolContext
const ro = { ...ctx, userRole: 'viewer' } as ToolContext

const deps = (over: Partial<DeliveryDeps> = {}): DeliveryDeps => ({
  resolveTask: async () => [{ id: 't1', name: 'Launch banner' }],
  resolveAssignee: async () => [{ id: 'a1', name: 'Ada' }],
  resolveStatus: async () => [{ id: 's1', name: 'In Progress' }],
  resolveBrief: async () => [{ id: 'b1', name: 'Spring campaign' }],
  propose: async () => 'prop-1',
  ...over,
})

describe('assign_task (propose)', () => {
  it('resolves task + assignee and stages a proposal', async () => {
    const res: any = await proposeAssignTask({ taskTitle: 'Launch banner', assigneeName: 'Ada' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect(res.data.resolved).toEqual({ taskId: 't1', taskTitle: 'Launch banner', assigneeId: 'a1', assigneeName: 'Ada' })
    expect(res.data.proposalId).toBe('prop-1')
  })
  it('blocks read-only roles', async () => {
    const res: any = await proposeAssignTask({ taskTitle: 'x', assigneeName: 'y' }, ro, deps())
    expect(res.ok).toBe(false)
  })
  it('disambiguates multiple task matches without proposing', async () => {
    const propose = vi.fn()
    const res: any = await proposeAssignTask({ taskTitle: 'Launch', assigneeName: 'Ada' }, ctx,
      deps({ resolveTask: async () => [{ id: 't1', name: 'Launch banner' }, { id: 't2', name: 'Launch video' }], propose }))
    expect(res.data.disambiguation.field).toBe('taskTitle')
    expect(propose).not.toHaveBeenCalled()
  })
  it('fails when the assignee is unknown', async () => {
    const res: any = await proposeAssignTask({ taskTitle: 'Launch banner', assigneeName: 'Nobody' }, ctx,
      deps({ resolveAssignee: async () => [] }))
    expect(res.ok).toBe(false)
  })
})

describe('propose_status_change (propose)', () => {
  it('resolves the status within the task board and stages a proposal', async () => {
    const res: any = await proposeStatusChange({ taskTitle: 'Launch banner', status: 'In Progress' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect(res.data.resolved).toEqual({ taskId: 't1', taskTitle: 'Launch banner', statusId: 's1', statusName: 'In Progress' })
  })
  it('fails when no status matches on that board', async () => {
    const res: any = await proposeStatusChange({ taskTitle: 'Launch banner', status: 'Nope' }, ctx, deps({ resolveStatus: async () => [] }))
    expect(res.ok).toBe(false)
  })
})

describe('propose_brief_convert (propose)', () => {
  it('resolves the brief and carries the optional project name', async () => {
    const res: any = await proposeBriefConvert({ briefTitle: 'Spring campaign', projectName: 'Spring 2026' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect(res.data.resolved).toEqual({ briefId: 'b1', briefTitle: 'Spring campaign', projectName: 'Spring 2026' })
  })
})

describe('delivery executors', () => {
  it('assign_task PATCHes the assignee endpoint', async () => {
    const patch = vi.fn(async () => ({ id: 't1' }))
    const r = await makeAssignTaskExecutor(patch).execute({ taskId: 't1', taskTitle: 'X', assigneeId: 'a1', assigneeName: 'Ada' }, ctx)
    expect(patch).toHaveBeenCalledWith('/api/agency/tasks/t1/assignee', { assigneeId: 'a1' }, ctx)
    expect(r.resultRef).toBe('t1')
    expect(r.summary).toContain('Ada')
  })
  it('status change PATCHes the status endpoint', async () => {
    const patch = vi.fn(async () => ({ id: 't1' }))
    await makeStatusChangeExecutor(patch).execute({ taskId: 't1', taskTitle: 'X', statusId: 's1', statusName: 'Done' }, ctx)
    expect(patch).toHaveBeenCalledWith('/api/agency/tasks/t1/status', { statusId: 's1' }, ctx)
  })
  it('brief convert POSTs and returns the new project id, throwing without one', async () => {
    const ok = vi.fn(async () => ({ project: { id: 'p9', name: 'Spring 2026' }, tasksCreated: 3 }))
    const r = await makeBriefConvertExecutor(ok).execute({ briefId: 'b1', briefTitle: 'Spring', projectName: 'Spring 2026' }, ctx)
    expect(r.resultRef).toBe('p9')
    expect(r.summary).toContain('3 tasks')
    const bad = makeBriefConvertExecutor(async () => ({}))
    await expect(bad.execute({ briefId: 'b1', briefTitle: 'Spring' }, ctx)).rejects.toThrow()
  })
})
