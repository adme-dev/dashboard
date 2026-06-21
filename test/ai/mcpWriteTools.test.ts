import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

import {
  projectWriteTools,
  executeWriteConfirm,
  mcpProposeName,
  resolveProposeAction,
  MCP_CONFIRM_TOOL,
  type ConfirmDeps
} from '~~/server/utils/ai/mcp/writeTools'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ActionExecutor } from '~~/server/utils/ai/executors/types'

// admin holds every permission; viewer is read-only with none (mirrors mcpProject.test).
vi.mock('~~/server/utils/permissions', () => ({
  roleHasPermission: (role: string) => role === 'admin',
  isReadOnlyRole: (role: string) => role === 'viewer'
}))

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

  it('never throws — an executor that throws becomes handler_error', async () => {
    const res = await executeWriteConfirm({ proposalId: 'abcd1234' }, ctx('admin'),
      deps({ getExecutor: () => exec({ execute: async () => { throw new Error('boom') } }) }))
    expect(res).toMatchObject({ ok: false, code: 'handler_error' })
  })
})
