import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { MCP_REQUEST_AUDIENCE, type McpRequestClaim } from '~~/shared/utils/mcpRequestClaim'
import { createGodModeMcpCallExecutor } from '~~/server/utils/ai/mcp/directExecution'
import { resolveGodModeMcpExecution } from '~~/server/utils/ai/mcp/registry'
import { registry } from '~~/server/utils/ai/tools'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const IDEMPOTENCY_KEY = `mcp:${'a'.repeat(64)}`

function event() {
  return { context: {} } as any
}

async function ownerAuthority(requestEvent = event()) {
  return await resolveGodModeAuthority(requestEvent, USER_ID, {
    queryOneFresh: async () => ({ id: USER_ID })
  })
}

function claim(scope: string[] = ['mcp:read', 'mcp:write']): McpRequestClaim {
  return {
    uid: USER_ID,
    scope,
    godMode: false,
    jti: '33333333-3333-4333-8333-333333333333',
    exp: 2_000_000_000,
    audience: MCP_REQUEST_AUDIENCE,
    method: 'POST',
    path: '/api/internal/mcp/call',
    toolName: 'create_task',
    bodyDigest: 'b'.repeat(64)
  }
}

function harness(mutates: boolean) {
  const executeWrite = vi.fn(async () => ({ ok: true as const, data: { directExecution: true } }))
  const executeRead = vi.fn(async () => ({ ok: true as const, data: { count: 1 } }))
  const executeResolvedMutation = vi.fn(async () => ({ ok: true as const, data: { supplemental: true } }))
  return {
    executeWrite,
    executeRead,
    executeResolvedMutation,
    execute: createGodModeMcpCallExecutor({
      resolveExecution: vi.fn(() => ({
        name: mutates ? 'create_task' : 'get_tasks',
        canonicalName: mutates ? 'create_task' : 'get_tasks',
        kind: 'catalog',
        tool: {
          name: mutates ? 'create_task' : 'get_tasks',
          description: 'Test tool',
          parameters: z.object({}),
          mutates,
          handler: vi.fn()
        }
      }) as any),
      executeWrite: executeWrite as any,
      executeRead: executeRead as any,
      executeResolvedMutation: executeResolvedMutation as any,
      resolveIdentity: vi.fn(async () => ({ name: 'Paul Giurin', email: 'paul@adme.net.au' }))
    })
  }
}

describe('God mode MCP direct execution adapter', () => {
  it('routes a stale-false current owner write through the trusted Task 5 adapter with stable identity', async () => {
    const requestEvent = event()
    const authority = await ownerAuthority(requestEvent)
    const h = harness(true)

    await expect(h.execute({
      event: requestEvent,
      claim: claim(),
      authority,
      idempotencyKey: IDEMPOTENCY_KEY,
      toolName: 'create_task',
      args: { title: 'Ship' },
      requireWriteScope: true
    })).resolves.toEqual({ ok: true, data: { directExecution: true } })

    expect(h.executeWrite).toHaveBeenCalledWith(expect.objectContaining({
      authenticatedUserId: USER_ID,
      authority,
      idempotencyKey: IDEMPOTENCY_KEY,
      sessionDigest: 'b'.repeat(64)
    }))
  })

  it('passes the same stable identity to the audited read path without invoking the write coordinator', async () => {
    const requestEvent = event()
    const authority = await ownerAuthority(requestEvent)
    const h = harness(false)

    await h.execute({
      event: requestEvent,
      claim: { ...claim(['mcp:read']), toolName: 'get_tasks' },
      authority,
      idempotencyKey: IDEMPOTENCY_KEY,
      toolName: 'get_tasks',
      args: {}
    })

    expect(h.executeRead).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: IDEMPOTENCY_KEY }))
    expect(h.executeRead).toHaveBeenCalledWith(expect.objectContaining({
      ctx: expect.objectContaining({
        userName: 'Paul Giurin',
        userEmail: 'paul@adme.net.au',
        mcpScopes: new Set(['mcp:read']),
        godModeExecutionKey: IDEMPOTENCY_KEY
      })
    }))
    expect(h.executeWrite).not.toHaveBeenCalled()
  })

  it('bypasses missing signed write scope for an active owner and passes immutable audit controls', async () => {
    const requestEvent = event()
    const h = harness(true)

    await expect(h.execute({
      event: requestEvent,
      claim: claim(['mcp:read']),
      authority: await ownerAuthority(requestEvent),
      idempotencyKey: IDEMPOTENCY_KEY,
      toolName: 'create_task',
      args: { title: 'Ship' },
      requireWriteScope: true
    })).resolves.toEqual({ ok: true, data: { directExecution: true } })

    expect(h.executeWrite).toHaveBeenCalledWith(expect.objectContaining({
      bypassedControls: expect.arrayContaining(['confirmation', 'mcp_scope'])
    }))
  })

  it.each([
    ['generate_voiceover', 'supplemental', true, 'generate_voiceover'],
    ['propose_video_generation', 'supplemental', true, 'propose_video_generation'],
    ['propose_banner_render', 'supplemental', true, 'propose_banner_render'],
    ['confirm_action', 'supplemental', true, 'confirm_action'],
    ['propose_budget_change', 'catalog', true, 'propose_budget_change'],
    ['propose_create_task', 'catalog', true, 'create_task'],
    ['propose_team_memory', 'catalog', true, 'propose_team_memory']
    ,['remember', 'supplemental', true, 'remember']
  ] as const)('routes %s through its sole %s resolver', async (name, kind, _mutates, canonicalName) => {
    const requestEvent = event()
    const authority = await ownerAuthority(requestEvent)
    const executeWrite = vi.fn(async () => ({ ok: true as const, data: { directExecution: true } }))
    const executeRead = vi.fn(async () => ({ ok: true as const, data: { count: 1 } }))
    const executeResolvedMutation = vi.fn(async () => ({ ok: true as const, data: { supplemental: true } }))
    const descriptor = resolveGodModeMcpExecution({
      tools: registry,
      role: 'owner',
      scopes: ['mcp:read'],
      requireWriteScope: true,
      suiteFlags: {
        generation: false,
        writes: false,
        financial: false,
        video: false,
        videoGeneration: false,
        banners: false
      }
    }, name)!
    expect(descriptor).toMatchObject({ name, canonicalName, kind })
    const execute = createGodModeMcpCallExecutor({
      resolveExecution: vi.fn(() => descriptor as any),
      executeWrite: executeWrite as any,
      executeRead: executeRead as any,
      executeResolvedMutation: executeResolvedMutation as any
    })

    await execute({
      event: requestEvent,
      claim: { ...claim(), toolName: name },
      authority,
      idempotencyKey: IDEMPOTENCY_KEY,
      toolName: name,
      args: {}
    })

    if (kind === 'supplemental') {
      expect(executeResolvedMutation).toHaveBeenCalledWith(expect.objectContaining({ tool: descriptor.tool }))
      expect(executeWrite).not.toHaveBeenCalled()
    } else {
      expect(executeWrite).toHaveBeenCalledWith(expect.objectContaining({
        toolName: canonicalName,
        auditToolName: name
      }))
      expect(executeResolvedMutation).not.toHaveBeenCalled()
    }
  })

  it('routes remember through the local transactional mutation coordinator with owner scope-bypass audit', async () => {
    const requestEvent = event()
    const authority = await ownerAuthority(requestEvent)
    const descriptor = resolveGodModeMcpExecution({
      tools: registry,
      role: 'owner',
      scopes: ['mcp:read'],
      requireWriteScope: true,
      suiteFlags: { generation: false, writes: false, financial: false, video: false, videoGeneration: false, banners: false }
    }, 'remember')!
    const executeResolvedMutation = vi.fn(async () => ({ ok: true as const, data: { remembered: true } }))
    const execute = createGodModeMcpCallExecutor({
      resolveExecution: vi.fn(() => descriptor),
      executeWrite: vi.fn() as any,
      executeRead: vi.fn() as any,
      executeResolvedMutation: executeResolvedMutation as any
    })

    await execute({
      event: requestEvent,
      claim: { ...claim(['mcp:read']), toolName: 'remember' },
      authority,
      idempotencyKey: IDEMPOTENCY_KEY,
      toolName: 'remember',
      args: { content: 'Reports are always in AUD' },
      requireWriteScope: true
    })

    expect(descriptor).toMatchObject({ kind: 'supplemental', executionClass: 'local-transactional' })
    expect(executeResolvedMutation).toHaveBeenCalledWith(expect.objectContaining({
      executionClass: 'local-transactional',
      bypassedControls: expect.arrayContaining(['mcp_scope'])
    }))
  })

  it('rejects a subject mismatch or structural authority clone before either execution path', async () => {
    const requestEvent = event()
    const authority = await ownerAuthority(requestEvent)
    const h = harness(true)

    await expect(h.execute({
      event: requestEvent,
      claim: { ...claim(), uid: OTHER_USER_ID },
      authority,
      idempotencyKey: IDEMPOTENCY_KEY,
      toolName: 'create_task',
      args: {}
    })).rejects.toMatchObject({ statusCode: 403 })
    await expect(h.execute({
      event: requestEvent,
      claim: claim(),
      authority: { ...authority } as any,
      idempotencyKey: IDEMPOTENCY_KEY,
      toolName: 'create_task',
      args: {}
    })).rejects.toMatchObject({ statusCode: 403 })

    expect(h.executeWrite).not.toHaveBeenCalled()
    expect(h.executeRead).not.toHaveBeenCalled()
  })
})
