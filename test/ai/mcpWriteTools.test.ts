import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

import {
  projectWriteTools,
  executeWriteConfirm,
  mcpProposeName,
  resolveProposeAction,
  MCP_CONFIRM_TOOL,
  MCP_FINANCIAL_ACTIONS,
  MCP_FINANCIAL_RICH_CONFIRM,
  isFinancialAction,
  projectFinancialTools,
  type ConfirmDeps
} from '~~/server/utils/ai/mcp/writeTools'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ActionExecutor } from '~~/server/utils/ai/executors/types'
import { registry as REGISTRY } from '~~/server/utils/ai/tools/index'

// admin holds every permission; viewer is read-only with none (mirrors mcpProject.test).
// media_buyer additionally holds MEDIA_BUYING (for financial role-filter tests).
vi.mock('~~/server/utils/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/permissions')>()
  return {
    ...actual,
    roleHasPermission: (role: string, perm?: string) =>
      role === 'admin' || role === 'owner' || (role === 'media_buyer' && perm === 'MEDIA_BUYING'),
    isReadOnlyRole: (role: string) => role === 'viewer'
  }
})

const ctx = (role: string): ToolContext => ({ userId: 'u1', userRole: role, source: 'mcp', event: {} as never })

const tool = (over: Partial<AiTool<unknown>>): AiTool<unknown> => ({
  name: 'x', description: 'd', parameters: z.object({ v: z.string() }),
  handler: async () => ({ ok: true, data: {} }), mutates: true, ...over
}) as AiTool<unknown>

// safe (create_task), safe gated (propose_team_memory), and a FINANCIAL one that must be excluded.
const registry: AiTool<unknown>[] = [
  tool({ name: 'create_task' }),
  tool({ name: 'propose_team_memory', requiredPermission: 'MANAGEMENT' as never }),
  tool({ name: 'propose_quote', requiredPermission: 'SALES' as never }),
  tool({ name: 'get_overview', mutates: false })
]

describe('projectWriteTools', () => {
  it('returns nothing when the flag is off', () => {
    expect(projectWriteTools(registry, 'admin', false)).toEqual([])
  })

  it('lists propose_* for safe writes + a single confirm_action, when enabled', () => {
    const names = projectWriteTools(registry, 'admin', true).map(t => t.name)
    expect(names).toContain('propose_create_task')
    expect(names).toContain('propose_team_memory')
    expect(names).toContain(MCP_CONFIRM_TOOL)
    expect(names.filter(n => n === MCP_CONFIRM_TOOL)).toHaveLength(1)
  })

  it('EXCLUDES financial writes (propose_quote) even when enabled', () => {
    const names = projectWriteTools(registry, 'admin', true).map(t => t.name)
    expect(names).not.toContain('propose_quote')
  })

  it('role-scopes: a role without permissions gets no write tools', () => {
    expect(projectWriteTools(registry, 'viewer', true)).toEqual([])
  })
})

describe('mcpProposeName / resolveProposeAction', () => {
  it('does not double-prefix and round-trips', () => {
    expect(mcpProposeName('create_task')).toBe('propose_create_task')
    expect(mcpProposeName('propose_opportunity')).toBe('propose_opportunity')
    expect(resolveProposeAction('propose_create_task')).toBe('create_task')
    expect(resolveProposeAction('propose_opportunity')).toBe('propose_opportunity')
    expect(resolveProposeAction('propose_quote')).toBeNull() // not in safe set
  })
})

const exec = (over: Partial<ActionExecutor>): ActionExecutor => ({
  toolName: 'create_task', label: 'task', riskTier: 'confirm',
  execute: async () => ({ resultRef: 'id1', summary: '✅ done' }), ...over
}) as ActionExecutor

const deps = (over: Partial<ConfirmDeps>): ConfirmDeps => ({
  enabled: true,
  claim: async () => ({ tool_name: 'create_task', resolved_payload: { v: 1 } }),
  getExecutor: () => exec({}),
  ...over
})

describe('executeWriteConfirm', () => {
  it('refuses when the flag is off (disabled)', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'), deps({ enabled: false }))
    expect(res).toMatchObject({ ok: false, code: 'disabled' })
  })

  it('rejects bad args', async () => {
    const res = await executeWriteConfirm({ nope: 1 }, ctx('admin'), deps({}))
    expect(res).toMatchObject({ ok: false, code: 'bad_args' })
  })

  it('returns expired when nothing is claimable (atomic single-use)', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'), deps({ claim: async () => null }))
    expect(res).toMatchObject({ ok: false, code: 'expired' })
  })

  it('replays the exact durable proposal result when the single-use claim is already consumed', async () => {
    const durable = { jobId: 'job-1', status: 'queued' }
    const replay = vi.fn(async () => ({ ok: true as const, data: durable }))
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'), deps({
      claim: async () => null,
      replay
    }))
    expect(res).toEqual({ ok: true, data: { replay: 'already_confirmed', ...durable } })
    expect(replay).toHaveBeenCalledWith('abcd1234', 'u1')
  })

  it('satisfies the dispatch checkpoint when serving a replayed outcome', async () => {
    const markDispatched = vi.fn(async () => {})
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'), deps({
      claim: async () => null,
      replay: async () => ({ ok: true as const, data: { jobId: 'job-1', status: 'failed', error: 'released' } }),
      execution: { markDispatched, captureResult: async () => {} } as never
    }))
    expect(markDispatched).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ ok: true, data: { replay: 'already_confirmed', jobId: 'job-1', status: 'failed' } })
  })

  it('forbids a claimed row whose tool is not in the safe set', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'),
      deps({ claim: async () => ({ tool_name: 'propose_quote', resolved_payload: {} }) }))
    expect(res).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('requires ack for a rich_confirm executor', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'),
      deps({ getExecutor: () => exec({ riskTier: 'rich_confirm' }) }))
    expect(res).toMatchObject({ ok: false, code: 'confirm_required' })
  })

  it('re-checks executor permission at confirm time', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('viewer'),
      deps({ getExecutor: () => exec({ requiredPermission: 'CLIENTS' as never }) }))
    expect(res).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('executes and returns the executor result on success', async () => {
    const execute = vi.fn(async () => ({ resultRef: 'task9', summary: '✅ Created' }))
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'),
      deps({ getExecutor: () => exec({ execute }) }))
    expect(res).toEqual({ ok: true, data: { resultRef: 'task9', summary: '✅ Created' } })
    expect(execute).toHaveBeenCalledWith({ v: 1 }, expect.objectContaining({ userId: 'u1' }))
  })

  it('persists the exact successful result before returning it', async () => {
    const persistResult = vi.fn(async () => {})
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'), deps({ persistResult }))
    expect(res).toEqual({ ok: true, data: { resultRef: 'id1', summary: '✅ done' } })
    expect(persistResult).toHaveBeenCalledWith('abcd1234', 'u1', { resultRef: 'id1', summary: '✅ done' })
  })

  it('returns success pending reconciliation when durable result persistence is uncertain', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'), deps({
      persistResult: async () => { throw new Error('database timeout') }
    }))
    expect(res).toEqual({
      ok: true,
      data: { resultRef: 'id1', summary: '✅ done', reconciliation: 'pending' }
    })
  })

  it('never throws — an executor that throws becomes handler_error', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'),
      deps({ getExecutor: () => exec({ execute: async () => { throw new Error('boom') } }) }))
    expect(res).toMatchObject({ ok: false, code: 'handler_error' })
  })

  // 2b: the shared confirm gains an optional videoDispatch (handles video tool_names, returns its own
  // outcome incl. cap_exceeded) and writeEnabled gates the 2c safe-action path independently.
  it('routes a video tool_name through videoDispatch (write group off)', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'), deps({
      writeEnabled: false,
      claim: async () => ({ tool_name: 'video_generation', resolved_payload: {} }),
      videoDispatch: async () => ({ ok: true, data: { jobId: 'j1' } })
    }))
    expect(res).toEqual({ ok: true, data: { jobId: 'j1' } })
  })

  it('forbids a 2c safe action when writeEnabled is off (video-only mode)', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'), deps({
      writeEnabled: false,
      claim: async () => ({ tool_name: 'create_task', resolved_payload: {} }),
      videoDispatch: async () => null
    }))
    expect(res).toMatchObject({ ok: false, code: 'forbidden' })
  })
})

describe('financial actions over MCP (#3 / D4)', () => {
  const ctx = { userId: 'u1', userRole: 'owner', event: {} as any } as any

  it('projectFinancialTools is empty unless the financial flag is on', () => {
    expect(projectFinancialTools(REGISTRY, 'owner', false)).toEqual([])
    const names = projectFinancialTools(REGISTRY, 'owner', true).map(t => t.name)
    for (const a of MCP_FINANCIAL_ACTIONS) expect(names).toContain(a)
    expect(names).toContain('confirm_action')
  })

  it('role-filters by each tool\'s own permission (eom_generate is ADMIN-only)', () => {
    // a MEDIA_BUYING-only role (media_buyer) must NOT see eom_generate/expense_* (ADMIN/FINANCE) but may see budget_change
    const names = projectFinancialTools(REGISTRY, 'media_buyer', true).map(t => t.name)
    expect(names).toContain('propose_budget_change')
    expect(names).not.toContain('propose_eom_generate')
    expect(names).not.toContain('propose_expense_approval')
  })

  it('confirm forbids a financial action when financialEnabled is off (even if write flag on)', async () => {
    const deps = { enabled: true, writeEnabled: true, financialEnabled: false,
      claim: vi.fn().mockResolvedValue({ tool_name: 'propose_quote', resolved_payload: {} }),
      getExecutor: vi.fn() } as any
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, deps)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('forbidden')
    expect(deps.getExecutor).not.toHaveBeenCalled()
  })

  it('money-mover requires ack:true', async () => {
    const exec = { execute: vi.fn().mockResolvedValue({ resultRef: '1', summary: 'ok' }), riskTier: 'rich_confirm' }
    const deps = { enabled: true, financialEnabled: true,
      claim: vi.fn().mockResolvedValue({ tool_name: 'propose_budget_change', resolved_payload: {} }),
      getExecutor: vi.fn().mockReturnValue(exec) } as any
    const noAck = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, deps)
    expect(noAck.ok).toBe(false); expect((noAck as any).code).toBe('confirm_required')
    const withAck = await executeWriteConfirm({ proposalId: 'prop12345', ack: true }, ctx, deps)
    expect(withAck.ok).toBe(true)
  })

  it('expense_approval (executor tier=confirm) STILL requires ack at the MCP boundary (money-mover)', async () => {
    const exec = { execute: vi.fn(), riskTier: 'confirm' } // executor is only 'confirm'
    const deps = { enabled: true, financialEnabled: true,
      claim: vi.fn().mockResolvedValue({ tool_name: 'propose_expense_approval', resolved_payload: {} }),
      getExecutor: vi.fn().mockReturnValue(exec) } as any
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, deps)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('confirm_required')
    expect(exec.execute).not.toHaveBeenCalled()
  })

  it('low-blast financial (expense_classify) dispatches without ack', async () => {
    const exec = { execute: vi.fn().mockResolvedValue({ resultRef: '1', summary: 'ok' }), riskTier: 'confirm' }
    const deps = { enabled: true, financialEnabled: true,
      claim: vi.fn().mockResolvedValue({ tool_name: 'propose_expense_classify', resolved_payload: {} }),
      getExecutor: vi.fn().mockReturnValue(exec) } as any
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, deps)
    expect(r.ok).toBe(true); expect(exec.execute).toHaveBeenCalled()
  })

  it('isFinancialAction + rich-confirm set are correct', () => {
    expect(isFinancialAction('propose_quote')).toBe(true)
    expect(isFinancialAction('create_task')).toBe(false)
    expect([...MCP_FINANCIAL_RICH_CONFIRM]).toEqual(['propose_budget_change','propose_bulk_set_campaign_budgets','propose_eom_generate','propose_expense_approval'])
  })
})
