import { describe, it, expect, vi } from 'vitest'
import { getExecutor, executors } from '~~/server/utils/ai/executors'
import { makeCreateTaskExecutor } from '~~/server/utils/ai/executors/createTask'
import { effectiveRiskTier } from '~~/server/utils/ai/toolRegistry'

const ctx = (userId = 'u1') => ({ userId, userRole: 'account_manager', conversationId: 'c1', event: { headers: {} } as any })

describe('executor registry', () => {
  it('resolves a registered executor by tool_name', () => {
    expect(getExecutor('create_task')?.toolName).toBe('create_task')
    expect(executors.create_task).toBeDefined()
  })

  it('returns null for an unregistered action (fail-safe)', () => {
    expect(getExecutor('definitely_not_a_tool')).toBeNull()
  })
})

describe('createTask executor', () => {
  it('maps the proposal to the task body, posts it, and returns resultRef + summary', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'task-42' })
    const exec = makeCreateTaskExecutor(post)
    const res = await exec.execute(
      { title: 'Ship it', departmentId: 'd1', assigneeId: 'm1', assigneeName: 'Sam', projectId: null, dueDate: null, description: null },
      ctx() as any,
    )
    expect(res.resultRef).toBe('task-42')
    expect(res.summary).toBe('✅ Created task “Ship it” for Sam.')
    // body is mapped via proposalToTaskBody (nulls → undefined, reporterId = ctx.userId)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toMatchObject({ departmentId: 'd1', title: 'Ship it', assigneeId: 'm1', reporterId: 'u1' })
  })

  it('summary omits the assignee clause when there is none', async () => {
    const exec = makeCreateTaskExecutor(vi.fn().mockResolvedValue({ id: 't1' }))
    const res = await exec.execute({ title: 'Solo task', departmentId: 'd1' }, ctx() as any)
    expect(res.summary).toBe('✅ Created task “Solo task”.')
  })

  it('propagates a failed post (so executeProposal can revert)', async () => {
    const exec = makeCreateTaskExecutor(vi.fn().mockRejectedValue(new Error('insert failed')))
    await expect(exec.execute({ title: 'X', departmentId: 'd1' }, ctx() as any)).rejects.toThrow('insert failed')
  })

  it('declares the confirm risk tier', () => {
    expect(getExecutor('create_task')?.riskTier).toBe('confirm')
  })
})

describe('effectiveRiskTier', () => {
  it('defaults reads to auto and writes to confirm; explicit wins', () => {
    expect(effectiveRiskTier({ mutates: false })).toBe('auto')
    expect(effectiveRiskTier({ mutates: true })).toBe('confirm')
    expect(effectiveRiskTier({ mutates: true, riskTier: 'rich_confirm' })).toBe('rich_confirm')
    expect(effectiveRiskTier({ mutates: false, riskTier: 'rich_confirm' })).toBe('rich_confirm')
  })
})
