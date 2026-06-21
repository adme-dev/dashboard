import { describe, it, expect, vi } from 'vitest'
import { getExecutor, executors } from '~~/server/utils/ai/executors'
import { makeCreateTaskExecutor } from '~~/server/utils/ai/executors/createTask'
import { makeScheduleSocialPostExecutor } from '~~/server/utils/ai/executors/scheduleSocialPost'
import { makeBudgetAlertExecutor } from '~~/server/utils/ai/executors/proposeBudgetAlert'
import { makeBudgetChangeExecutor } from '~~/server/utils/ai/executors/proposeBudgetChange'
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

  it('resolves the propose_schedule_post executor (Phase 2)', () => {
    expect(getExecutor('propose_schedule_post')?.toolName).toBe('propose_schedule_post')
    expect(getExecutor('propose_schedule_post')?.riskTier).toBe('confirm')
  })
})

describe('scheduleSocialPost executor', () => {
  it('maps the proposal to the publishing body, posts it, and returns resultRef + summary', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'post-7' })
    const exec = makeScheduleSocialPostExecutor(post)
    const res = await exec.execute(
      { clientId: 'cl1', clientName: 'Acme', content: 'Launch day', platforms: ['facebook'], scheduledAt: '2026-07-01T09:00:00Z', status: 'scheduled', linkUrl: null, firstComment: null },
      ctx() as any,
    )
    expect(res.resultRef).toBe('post-7')
    expect(res.summary).toContain('Acme')
    expect(res.summary).toContain('2026-07-01T09:00:00Z')
    expect(post.mock.calls[0][0]).toMatchObject({ clientId: 'cl1', content: 'Launch day', status: 'scheduled', platforms: ['facebook'] })
  })

  it('summarises a draft when there is no scheduledAt', async () => {
    const exec = makeScheduleSocialPostExecutor(vi.fn().mockResolvedValue({ id: 'p1' }))
    const res = await exec.execute({ clientId: 'cl1', clientName: 'Acme', content: 'x', status: 'draft' }, ctx() as any)
    expect(res.summary).toContain('draft')
  })

  it('propagates a failed post (so executeProposal can revert)', async () => {
    const exec = makeScheduleSocialPostExecutor(vi.fn().mockRejectedValue(new Error('insert failed')))
    await expect(exec.execute({ clientId: 'cl1', content: 'x', status: 'draft' }, ctx() as any)).rejects.toThrow('insert failed')
  })
})

describe('budgetAlert executor', () => {
  it('maps the proposal to the budget-alerts body, posts it, and reads the nested alert.id', async () => {
    // The endpoint returns { success, alert: { id } } — id is nested, not top-level.
    const post = vi.fn().mockResolvedValue({ success: true, alert: { id: 'alert-3' } })
    const exec = makeBudgetAlertExecutor(post)
    const res = await exec.execute(
      { clientId: 'cl1', clientName: 'Acme', alertType: 'budget_threshold', severity: 'warning', title: 'Watch Acme', message: null, thresholdValue: 90 },
      ctx() as any,
    )
    expect(res.resultRef).toBe('alert-3')
    expect(res.summary).toContain('Acme')
    expect(res.summary).toContain('90')
    expect(post.mock.calls[0][0]).toMatchObject({ clientId: 'cl1', alertType: 'budget_threshold', severity: 'warning', title: 'Watch Acme', thresholdValue: 90 })
  })

  it('throws when the create returns no id (so executeProposal surfaces a failure, not a phantom success)', async () => {
    const exec = makeBudgetAlertExecutor(vi.fn().mockResolvedValue({ success: true }))
    await expect(exec.execute({ clientId: 'cl1', clientName: 'Acme', title: 't' }, ctx() as any)).rejects.toThrow(/no id/)
  })

  it('declares the confirm risk tier', () => {
    expect(getExecutor('propose_budget_alert')?.riskTier).toBe('confirm')
  })
})

describe('budgetChange executor (plans, never executes a live write)', () => {
  it('PLANS the change via the spend-actions endpoint and summarises current→proposed', async () => {
    const post = vi.fn().mockResolvedValue({ planned: true, action: { id: 'act-9' } })
    const exec = makeBudgetChangeExecutor(post)
    const res = await exec.execute(
      { mediaSpendId: 'ms1', campaignName: 'Acme Retargeting', currentDailyBudget: 50, newDailyBudget: 40, pctChange: -20, reason: 'overpacing', issueType: 'overpacing' },
      ctx() as any,
    )
    expect(res.resultRef).toBe('act-9')
    expect(res.summary).toContain('50→40/day')
    expect(res.summary).toContain('nothing has changed on the platform yet')
    // delegates to the plan endpoint with the mediaSpendId in the path + ai_copilot source
    expect(post.mock.calls[0][0]).toBe('ms1')
    expect(post.mock.calls[0][1]).toMatchObject({ currentDailyBudget: 50, recommendedDailyBudget: 40, source: 'ai_copilot' })
  })

  it('is rich_confirm tier (gated by the confirm endpoint)', () => {
    expect(getExecutor('propose_budget_change')?.riskTier).toBe('rich_confirm')
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

describe('executor ↔ tool gating parity (no silent gate downgrade)', () => {
  it('every mutating tool has an executor whose riskTier + requiredPermission match the tool', async () => {
    const { registry } = await import('~~/server/utils/ai/tools')
    const writeTools = registry.filter((t: any) => t.mutates)
    expect(writeTools.length).toBeGreaterThanOrEqual(4)
    for (const t of writeTools) {
      const ex = getExecutor(t.name)
      expect(ex, `no executor registered for write tool ${t.name}`).toBeTruthy()
      // The confirm endpoint enforces the gate off the EXECUTOR's tiers — they must equal the tool's,
      // or a rich_confirm / permission gate could be silently bypassed at confirm time.
      expect(ex!.riskTier, `${t.name} riskTier drift`).toBe(effectiveRiskTier(t))
      expect(ex!.requiredPermission, `${t.name} permission drift`).toBe(t.requiredPermission)
    }
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
