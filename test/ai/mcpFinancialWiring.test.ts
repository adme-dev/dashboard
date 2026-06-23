/**
 * mcpFinancialWiring.test.ts
 * Task 2 / #3 D4 — assert that the financial tools appear in the manifest ONLY when
 * MCP_FINANCIAL_TOOLS_ENABLED='true', and that a financial propose is rejected (disabled/forbidden)
 * when the flag is off. Mirrors the banner-wiring / write-tools test harness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  projectFinancialTools,
  isFinancialAction,
  MCP_FINANCIAL_ACTIONS,
  MCP_CONFIRM_TOOL,
  executeWriteConfirm,
  type ConfirmDeps
} from '~~/server/utils/ai/mcp/writeTools'
import { registry as REGISTRY } from '~~/server/utils/ai/tools/index'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ActionExecutor } from '~~/server/utils/ai/executors/types'

vi.mock('~~/server/utils/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/permissions')>()
  return {
    ...actual,
    roleHasPermission: (role: string, _perm?: string) => role === 'admin' || role === 'owner',
    isReadOnlyRole: (role: string) => role === 'viewer'
  }
})

const ctx = (role = 'owner'): ToolContext => ({ userId: 'u1', userRole: role, event: {} as never, source: 'mcp' })

// ---------------------------------------------------------------------------
// Manifest inclusion — mirrors how tools.post.ts builds the manifest
// ---------------------------------------------------------------------------
describe('financial tools manifest inclusion (mirrors tools.post.ts)', () => {
  it('projectFinancialTools returns [] when the flag is off', () => {
    expect(projectFinancialTools(REGISTRY as AiTool<unknown>[], 'owner', false)).toEqual([])
  })

  it('projectFinancialTools includes all 6 propose_* tools + confirm_action when flag is on', () => {
    const names = projectFinancialTools(REGISTRY as AiTool<unknown>[], 'owner', true).map(t => t.name)
    for (const a of MCP_FINANCIAL_ACTIONS) {
      expect(names).toContain(a)
    }
    expect(names).toContain(MCP_CONFIRM_TOOL)
    // confirm_action appears exactly once from this group
    expect(names.filter(n => n === MCP_CONFIRM_TOOL)).toHaveLength(1)
  })

  it('role-filters: viewer gets no financial tools even when flag is on', () => {
    const tools = projectFinancialTools(REGISTRY as AiTool<unknown>[], 'viewer', true)
    expect(tools).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// isFinancialAction coverage
// ---------------------------------------------------------------------------
describe('isFinancialAction', () => {
  it('returns true for all 6 financial action names', () => {
    for (const a of MCP_FINANCIAL_ACTIONS) {
      expect(isFinancialAction(a)).toBe(true)
    }
  })
  it('returns false for safe (2c) action names', () => {
    expect(isFinancialAction('create_task')).toBe(false)
    expect(isFinancialAction('propose_schedule_post')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Financial propose rejection when flag is off — mirrors the call.post.ts gate
// The endpoint checks `financialEnabled` BEFORE routing the propose handler and
// returns { ok: false, error: ..., code: 'disabled' } when off.
// We test the same seam via executeWriteConfirm (the confirm path) AND verify
// that a financial action reaching confirm while financialEnabled=false is forbidden.
// ---------------------------------------------------------------------------

const execStub = (over: Partial<ActionExecutor> = {}): ActionExecutor => ({
  toolName: 'propose_quote', label: 'quote', riskTier: 'confirm',
  execute: vi.fn().mockResolvedValue({ resultRef: 'r1', summary: 'ok' }),
  ...over
}) as ActionExecutor

function baseDeps(over: Partial<ConfirmDeps> = {}): ConfirmDeps {
  return {
    enabled: true,
    writeEnabled: false,    // financial is gated separately
    financialEnabled: true, // default: financial on
    claim: vi.fn().mockResolvedValue({ tool_name: 'propose_quote', resolved_payload: {} }),
    getExecutor: vi.fn().mockReturnValue(execStub()),
    ...over
  }
}

describe('executeWriteConfirm — financial flag gate', () => {
  it('forbids a financial action when financialEnabled is off (even if enabled=true)', async () => {
    const r = await executeWriteConfirm(
      { proposalId: 'prop12345' },
      ctx(),
      baseDeps({ financialEnabled: false })
    )
    expect(r.ok).toBe(false)
    expect((r as any).code).toBe('forbidden')
  })

  it('dispatches when financialEnabled is on and action is a non-money-mover', async () => {
    const execute = vi.fn().mockResolvedValue({ resultRef: 'r1', summary: 'ok' })
    const r = await executeWriteConfirm(
      { proposalId: 'prop12345' },
      ctx(),
      baseDeps({
        financialEnabled: true,
        claim: vi.fn().mockResolvedValue({ tool_name: 'propose_expense_classify', resolved_payload: {} }),
        getExecutor: vi.fn().mockReturnValue(execStub({ execute }))
      })
    )
    expect(r.ok).toBe(true)
    expect(execute).toHaveBeenCalled()
  })

  it('money-mover (propose_budget_change) requires ack:true at the MCP boundary', async () => {
    const execute = vi.fn().mockResolvedValue({ resultRef: 'r1', summary: 'ok' })
    const r = await executeWriteConfirm(
      { proposalId: 'prop12345' }, // no ack
      ctx(),
      baseDeps({
        financialEnabled: true,
        claim: vi.fn().mockResolvedValue({ tool_name: 'propose_budget_change', resolved_payload: {} }),
        getExecutor: vi.fn().mockReturnValue(execStub({ execute }))
      })
    )
    expect(r.ok).toBe(false)
    expect((r as any).code).toBe('confirm_required')
    expect(execute).not.toHaveBeenCalled()
  })

  it('confirm_action gate: enabled=false → disabled before claim is attempted', async () => {
    const claim = vi.fn()
    const r = await executeWriteConfirm(
      { proposalId: 'prop12345' },
      ctx(),
      baseDeps({ enabled: false, financialEnabled: true, claim })
    )
    expect(r.ok).toBe(false)
    expect((r as any).code).toBe('disabled')
    expect(claim).not.toHaveBeenCalled()
  })

  it('financial action does NOT fall through to the 2c safe-action path (writeEnabled=true)', async () => {
    // Even if writeEnabled is on, a financial action must be gated solely by financialEnabled.
    const r = await executeWriteConfirm(
      { proposalId: 'prop12345' },
      ctx(),
      baseDeps({
        writeEnabled: true,
        financialEnabled: false,
        claim: vi.fn().mockResolvedValue({ tool_name: 'propose_eom_generate', resolved_payload: {} }),
        getExecutor: vi.fn().mockReturnValue(execStub())
      })
    )
    expect(r.ok).toBe(false)
    expect((r as any).code).toBe('forbidden')
  })
})
