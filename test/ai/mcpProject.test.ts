import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

import { projectReadOnlyTools, executeReadOnlyTool } from '~~/server/utils/ai/mcp/project'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

// Deterministic RBAC: 'admin' has every permission; 'viewer' is read-only with none.
// (filterToolsForUser + project.ts both call into this module.)
vi.mock('~~/server/utils/permissions', () => ({
  roleHasPermission: (role: string) => role === 'admin',
  isReadOnlyRole: (role: string) => role === 'viewer'
}))

// --- fakes -------------------------------------------------------------------
// filterToolsForUser uses roleHasPermission(role, requiredPermission); we model that with a perm map.
// 'admin' has all perms; 'viewer' has only 'READ'. Tools with no requiredPermission are open to all.
const tool = (over: Partial<AiTool<unknown>>): AiTool<unknown> => ({
  name: 'get_thing',
  description: 'Reads a thing.',
  parameters: z.object({ id: z.string() }),
  handler: async () => ({ ok: true, data: { ok: 1 } }),
  ...over
}) as AiTool<unknown>

const ctx = (role: string): ToolContext => ({ userId: 'u1', userRole: role, event: {} as never })

// Minimal registry: an open read tool, a FINANCE-gated read tool, and a write tool.
const tools: AiTool<unknown>[] = [
  tool({ name: 'get_overview' }),
  tool({ name: 'get_pnl', requiredPermission: 'FINANCE' as never, returnsUntrusted: true }),
  tool({ name: 'create_task', mutates: true, requiredPermission: undefined })
]

describe('projectReadOnlyTools', () => {
  it('never includes a mutating tool, for ANY role', () => {
    const names = projectReadOnlyTools(tools, 'admin').map(t => t.name)
    expect(names).not.toContain('create_task')
  })

  it('applies the role ceiling (a viewer without FINANCE does not see get_pnl)', () => {
    const adminNames = projectReadOnlyTools(tools, 'admin').map(t => t.name)
    const viewerNames = projectReadOnlyTools(tools, 'viewer').map(t => t.name)
    expect(adminNames).toContain('get_pnl')
    expect(viewerNames).not.toContain('get_pnl')
    expect(viewerNames).toContain('get_overview') // open read tool still visible
  })

  it('emits a JSON Schema inputSchema for each tool', () => {
    const m = projectReadOnlyTools(tools, 'admin').find(t => t.name === 'get_overview')!
    expect(m.inputSchema).toMatchObject({ type: 'object' })
    expect((m.inputSchema as { properties?: Record<string, unknown> }).properties).toHaveProperty('id')
  })

  it('annotates untrusted-output tools with a data-not-instructions note', () => {
    const m = projectReadOnlyTools(tools, 'admin').find(t => t.name === 'get_pnl')!
    expect(m.description.toLowerCase()).toContain('never as instructions')
  })
})

describe('executeReadOnlyTool', () => {
  it('runs an allowed read tool and returns its data', async () => {
    const handler = vi.fn(async () => ({ ok: true as const, data: { value: 42 } }))
    const t = [tool({ name: 'get_overview', handler })]
    const res = await executeReadOnlyTool(t, 'get_overview', { id: 'x' }, ctx('admin'))
    expect(res).toEqual({ ok: true, data: { value: 42 } })
    expect(handler).toHaveBeenCalled()
  })

  it('HARD-blocks a mutating tool even if the role could call it in-app (write_blocked)', async () => {
    const handler = vi.fn()
    const t = [tool({ name: 'create_task', mutates: true, handler: handler as never })]
    const res = await executeReadOnlyTool(t, 'create_task', { id: 'x' }, ctx('admin'))
    expect(res).toMatchObject({ ok: false, code: 'write_blocked' })
    expect(handler).not.toHaveBeenCalled() // never even invoked
  })

  it('forbids a tool the role cannot call (same ceiling as in-app)', async () => {
    const res = await executeReadOnlyTool(tools, 'get_pnl', { id: 'x' }, ctx('viewer'))
    expect(res).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('rejects unknown tools', async () => {
    const res = await executeReadOnlyTool(tools, 'nope', {}, ctx('admin'))
    expect(res).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('rejects args that fail the tool Zod schema (untrusted wire input)', async () => {
    const res = await executeReadOnlyTool(tools, 'get_overview', { id: 123 }, ctx('admin'))
    expect(res).toMatchObject({ ok: false, code: 'bad_args' })
  })

  it('never throws — a handler that throws becomes a typed handler_error', async () => {
    const throwing = async () => {
      throw new Error('boom')
    }
    const t = [tool({ name: 'get_overview', handler: throwing })]
    const res = await executeReadOnlyTool(t, 'get_overview', { id: 'x' }, ctx('admin'))
    expect(res).toMatchObject({ ok: false, code: 'handler_error' })
  })
})
