import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { MCP_REQUEST_AUDIENCE, type McpRequestClaim } from '~~/shared/utils/mcpRequestClaim'
import { createGodModeMcpCallExecutor } from '~~/server/utils/ai/mcp/directExecution'
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
  return {
    executeWrite,
    executeRead,
    execute: createGodModeMcpCallExecutor({
      resolveTool: vi.fn(() => ({
        name: mutates ? 'create_task' : 'get_tasks',
        description: 'Test tool',
        parameters: z.object({}),
        mutates,
        handler: vi.fn()
      }) as any),
      executeWrite: executeWrite as any,
      executeRead: executeRead as any
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
      args: { title: 'Ship' }
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
    expect(h.executeWrite).not.toHaveBeenCalled()
  })

  it('retains signed write scope as transport authority for an owner', async () => {
    const requestEvent = event()
    const h = harness(true)

    await expect(h.execute({
      event: requestEvent,
      claim: claim(['mcp:read']),
      authority: await ownerAuthority(requestEvent),
      idempotencyKey: IDEMPOTENCY_KEY,
      toolName: 'create_task',
      args: { title: 'Ship' }
    })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('write access') })

    expect(h.executeWrite).not.toHaveBeenCalled()
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
