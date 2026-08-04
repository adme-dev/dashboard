import { describe, it, expect, vi } from 'vitest'

const memoryMocks = vi.hoisted(() => ({ index: vi.fn(async () => undefined) }))
vi.mock('~~/server/utils/ai/memory/embed', () => ({ indexMemoryVector: memoryMocks.index }))
import * as rememberModule from '~~/server/utils/ai/tools/remember'
import { remember, rememberTool, type RememberDeps } from '~~/server/utils/ai/tools/remember'
import { registry } from '~~/server/utils/ai/tools'

const ctx = (userId = 'u1') => ({ userId, userRole: 'media_buyer', conversationId: 'c1', event: {} as any })

describe('remember tool', () => {
  it('saves an explicit, user-scoped, higher-salience memory', async () => {
    const save = vi.fn<RememberDeps['save']>().mockResolvedValue('mem-1')
    const res = await remember({ content: '  prefers ROAS over CPA  ', memType: 'semantic' }, ctx() as any, { save })
    expect(res.ok).toBe(true)
    expect((res as any).data).toMatchObject({ remembered: true, id: 'mem-1', content: 'prefers ROAS over CPA' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toEqual({
      userId: 'u1', memType: 'semantic', content: 'prefers ROAS over CPA', source: 'explicit', salience: 0.7,
    })
  })

  it('rejects empty/whitespace content without saving', async () => {
    const save = vi.fn()
    const res = await remember({ content: '   ', memType: 'semantic' }, ctx() as any, { save })
    expect(res.ok).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })

  it('passes through episodic/procedural type', async () => {
    const save = vi.fn().mockResolvedValue('m2')
    await remember({ content: 'monday recap routine', memType: 'procedural' }, ctx() as any, { save })
    expect(save.mock.calls[0][0].memType).toBe('procedural')
  })

  it('is fail-safe: a throwing save returns a recoverable fail(), never propagates (finding #6)', async () => {
    const save = vi.fn<RememberDeps['save']>().mockRejectedValue(new Error('neon blip'))
    const res = await remember({ content: 'reports in AUD', memType: 'semantic' }, ctx() as any, { save })
    expect(res.ok).toBe(false)
  })

  it('is registered and classified as a durable mutation', () => {
    expect(registry.find(t => t.name === 'remember')).toBeDefined()
    expect(rememberTool.mutates).toBe(true)
    expect((rememberTool as any).directMutation?.executionClass).toBe('local-transactional')
  })

  it('does not publish a vector before the transaction containing memory and audit commits', async () => {
    memoryMocks.index.mockClear()
    const query = vi.fn(async () => ({ rows: [{ id: 'memory-tx' }], rowCount: 1 }))

    await expect(rememberTool.directMutation!.execute(
      { content: 'Reports are in AUD', memType: 'semantic' },
      ctx() as any,
      { query }
    )).resolves.toMatchObject({ ok: true, data: { id: 'memory-tx' } })

    expect(query).toHaveBeenCalledTimes(1)
    expect(memoryMocks.index).not.toHaveBeenCalled()
  })

  it('commits one ordinary MCP memory with its audit and replays without another write', async () => {
    const execute = (rememberModule as any).executeOrdinaryMcpRememberMutation
    expect(execute).toBeTypeOf('function')
    if (typeof execute !== 'function') return

    let ledger: any = null
    let committedWrites = 0
    let staged: { ledger: any, writes: number } | null = null
    const executeMutation = vi.fn(async () => ({ ok: true, data: { remembered: true, id: 'memory-1' } }))
    const deps = {
      transaction: async (callback: any) => {
        staged = { ledger: ledger ? { ...ledger } : null, writes: 0 }
        const result = await callback({ query: vi.fn() })
        ledger = staged.ledger
        committedWrites += staged.writes
        staged = null
        return result
      },
      claim: vi.fn(async () => {
        if (staged!.ledger) return { claimed: false, row: staged!.ledger }
        staged!.ledger = { state: 'in_progress', routeOrTool: 'remember', resultReference: null }
        return { claimed: true, row: staged!.ledger }
      }),
      executeMutation: vi.fn(async (args: any, context: any) => {
        const result = await executeMutation(args, context)
        staged!.writes++
        return result
      }),
      appendAudit: vi.fn(async () => undefined),
      complete: vi.fn(async (_request: any, identity: any) => {
        staged!.ledger = { ...staged!.ledger, state: 'succeeded', resultReference: identity.resultReference }
      })
    }
    const request = {
      userId: 'u1', idempotencyKey: `mcp:${'a'.repeat(64)}`, sessionDigest: 'b'.repeat(64),
      args: { content: 'Reports are in AUD', memType: 'semantic' }, ctx: ctx()
    }

    await expect(execute(request, deps)).resolves.toMatchObject({ ok: true, data: { remembered: true } })
    await expect(execute(request, deps)).resolves.toMatchObject({ ok: true, data: { replayed: true } })
    expect(executeMutation).toHaveBeenCalledTimes(1)
    expect(committedWrites).toBe(1)
  })

  it('rolls an ordinary MCP memory back on audit failure so a retry commits exactly one write', async () => {
    const execute = (rememberModule as any).executeOrdinaryMcpRememberMutation
    expect(execute).toBeTypeOf('function')
    if (typeof execute !== 'function') return

    let ledger: any = null
    let committedWrites = 0
    let auditAttempts = 0
    let staged: { ledger: any, writes: number } | null = null
    const deps = {
      transaction: async (callback: any) => {
        staged = { ledger: ledger ? { ...ledger } : null, writes: 0 }
        try {
          const result = await callback({ query: vi.fn() })
          ledger = staged.ledger
          committedWrites += staged.writes
          return result
        } finally {
          staged = null
        }
      },
      claim: vi.fn(async () => {
        if (staged!.ledger) return { claimed: false, row: staged!.ledger }
        staged!.ledger = { state: 'in_progress', routeOrTool: 'remember', resultReference: null }
        return { claimed: true, row: staged!.ledger }
      }),
      executeMutation: vi.fn(async () => {
        staged!.writes++
        return { ok: true, data: { remembered: true, id: 'memory-2' } }
      }),
      appendAudit: vi.fn(async () => {
        auditAttempts++
        if (auditAttempts === 1) throw new Error('audit insert failed')
      }),
      complete: vi.fn(async (_request: any, identity: any) => {
        staged!.ledger = { ...staged!.ledger, state: 'succeeded', resultReference: identity.resultReference }
      })
    }
    const request = {
      userId: 'u1', idempotencyKey: `mcp:${'c'.repeat(64)}`, sessionDigest: 'd'.repeat(64),
      args: { content: 'Reports are in AUD', memType: 'semantic' }, ctx: ctx()
    }

    await expect(execute(request, deps)).resolves.toMatchObject({ ok: false })
    await expect(execute(request, deps)).resolves.toMatchObject({ ok: true })
    await expect(execute(request, deps)).resolves.toMatchObject({ ok: true, data: { replayed: true } })
    expect(committedWrites).toBe(1)
  })
})
