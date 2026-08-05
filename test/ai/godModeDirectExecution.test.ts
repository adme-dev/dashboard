import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  createGodModeToolExecutor,
  createTrustedMcpGodModeReadExecutor,
  createTrustedMcpGodModeResolvedMutationExecutor,
  createTrustedMcpGodModeToolExecutor,
  type GodModeExecutionDependencies,
  type GodModeExecutionLedgerRow
} from '~~/server/utils/ai/godModeExecution'
import type { ActionExecutor, ExecutionServices } from '~~/server/utils/ai/executors/types'
import { executors } from '~~/server/utils/ai/executors'
import { ok } from '~~/server/utils/ai/toolContext'
import { listRegisteredGodModeMutationFamilies } from '~~/server/utils/godMode/featureGate'
import { registerGodModeChatMutationFamily } from '~~/server/utils/ai/godModeMutationFamily'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'
import { markTrustedPreDispatchError } from '~~/server/utils/ai/executionErrorProvenance'
import { resolveGenerationMcpExecutions } from '~~/server/utils/ai/mcp/generationTools'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const TENANT_ID = '33333333-3333-4333-8333-333333333333'
const CLIENT_ID = '44444444-4444-4444-8444-444444444444'
const CORRELATION_ID = '55555555-5555-4555-8555-555555555555'

function event(userId = OWNER_ID) {
  return { context: { user: { id: userId } }, headers: new Headers() } as any
}

function supplemental(provider: (args: any, ctx: any) => Promise<any>) {
  return async (args: any, ctx: any, services: any) => {
    await services.markDispatched()
    const result = await provider(args, ctx)
    if (result?.ok) await services.captureResult(result)
    return result
  }
}

function harness(options: {
  toolName?: string
  executionClass?: ActionExecutor['executionClass']
  actorId?: string
  authorityActive?: boolean
  scopeValid?: boolean
  executorError?: Error
  executorErrorAfterDispatch?: boolean
  attemptError?: Error
  terminalError?: Error
  failedAuditError?: Error
  progressErrorAt?: string
  expectedIdempotencyKey?: string
} = {}) {
  const toolName = options.toolName ?? 'create_task'
  const executionClass = options.executionClass ?? 'internal-http'
  const calls: string[] = []
  const ledger = new Map<string, GodModeExecutionLedgerRow>()
  let proposalClaimed = false
  let sideEffects = 0
  const executor: ActionExecutor = {
    toolName,
    label: toolName,
    riskTier: 'confirm',
    executionClass,
    async execute(payload, ctx, services) {
      calls.push('executor')
      expect(ctx.userId).toBe(options.actorId ?? OWNER_ID)
      expect(services.idempotencyKey).toBe(options.expectedIdempotencyKey ?? 'message-7:tool-call-2')
      sideEffects++
      if (options.executorError) {
        if (!options.executorErrorAfterDispatch) sideEffects--
        throw options.executorError
      }
      return { resultRef: `${toolName}-result`, summary: `executed ${toolName}` }
    }
  }
  const deps: GodModeExecutionDependencies = {
    requireAuth: vi.fn(async () => {
      calls.push('authority')
      return { id: options.actorId ?? OWNER_ID, role: 'owner' } as any
    }),
    resolveGodModeAuthority: vi.fn(async (_event, actorId) => ({
      active: options.authorityActive ?? true,
      actorUserId: actorId,
      reason: options.authorityActive === false ? 'inactive_or_missing' : 'active_owner',
      emergencyDisabled: false
    }) as any),
    resolveTool: vi.fn(() => ({
      name: toolName,
      parameters: z.object({ title: z.string().min(1), clientId: z.string().uuid().optional() }),
      mutates: true,
      handler: vi.fn(async (_args, ctx) => {
        calls.push('handler')
        expect(ctx.userId).toBe(options.actorId ?? OWNER_ID)
        return ok({ proposalId: 'proposal-1', resolved: { title: 'Ship', clientId: CLIENT_ID } })
      })
    }) as any),
    resolveExecutor: vi.fn(() => executor),
    claimExecution: vi.fn(async input => {
      calls.push('ledger')
      const existing = ledger.get(input.idempotencyKey)
      if (existing) return { claimed: false, row: existing }
      const row: GodModeExecutionLedgerRow = {
        actorUserId: input.actorUserId,
        channel: input.channel,
        idempotencyKey: input.idempotencyKey,
        state: 'in_progress',
        correlationId: CORRELATION_ID,
        routeOrTool: input.toolName,
        executorClass: input.executorClass,
        tenantId: input.tenantId ?? null,
        clientId: input.clientId ?? null,
        resultReference: null,
        resultDigest: null
      }
      ledger.set(input.idempotencyKey, row)
      return { claimed: true, row }
    }),
    appendAudit: vi.fn(async input => {
      calls.push(input.phase === 'attempt' ? 'attempt' : input.phase)
      if (input.phase === 'attempt' && options.attemptError) throw options.attemptError
      if (input.phase === 'succeeded' && options.terminalError) throw options.terminalError
      if (input.phase === 'failed' && options.failedAuditError) throw options.failedAuditError
    }),
    validateScope: vi.fn(async input => {
      calls.push('scope')
      return options.scopeValid === false
        ? { ok: false, code: 'tenant_mismatch' as const }
        : { ok: true as const, tenantId: input.tenantId ?? TENANT_ID, clientId: input.clientId ?? CLIENT_ID }
    }),
    claimProposal: vi.fn(async input => {
      calls.push('proposal')
      if (proposalClaimed || input.actorUserId !== (options.actorId ?? OWNER_ID)) return null
      proposalClaimed = true
      return { id: input.proposalId, tool_name: toolName, resolved_payload: { title: 'Ship', clientId: CLIENT_ID }, user_id: input.actorUserId }
    }),
    associateProposal: vi.fn(async () => undefined),
    dismissProposals: vi.fn(async () => undefined),
    completeProposal: vi.fn(async () => undefined),
    setExecutionState: vi.fn(async input => {
      calls.push(`ledger:${input.state}`)
      const current = ledger.get(input.idempotencyKey)!
      ledger.set(input.idempotencyKey, {
        ...current,
        state: input.state,
        resultReference: input.resultReference ?? current.resultReference,
        resultDigest: input.resultDigest ?? current.resultDigest
      })
    }),
    recordExecutionProgress: vi.fn(async input => {
      calls.push(`progress:${input.phase}`)
      if (options.progressErrorAt === input.phase) throw new Error(`progress ${input.phase} unavailable`)
    }),
    installInternalExecutionDelegator: vi.fn(() => { calls.push('delegation') }),
    transaction: vi.fn(async callback => callback({ query: vi.fn() } as any)),
    enqueueTerminalAudit: vi.fn(async () => true),
    sessionDigest: vi.fn(() => 'a'.repeat(64)),
    correlationId: vi.fn(() => CORRELATION_ID)
  }
  return {
    calls,
    deps,
    ledger,
    execute: createGodModeToolExecutor(deps),
    sideEffects: () => sideEffects
  }
}

describe('God mode direct execution', () => {
  it('executes a trusted MCP write through the same coordinator with an MCP ledger and audit identity', async () => {
    const h = harness({ expectedIdempotencyKey: `mcp:${'c'.repeat(64)}` })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const result = await createTrustedMcpGodModeToolExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'create_task',
      args: { title: 'Ship', clientId: CLIENT_ID },
      idempotencyKey: `mcp:${'c'.repeat(64)}`,
      tenantId: TENANT_ID,
      clientId: CLIENT_ID
    })

    expect(result).toMatchObject({ ok: true, data: { directExecution: true } })
    expect(h.deps.requireAuth).not.toHaveBeenCalled()
    expect(h.deps.resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(h.deps.claimExecution).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: OWNER_ID,
      channel: 'mcp',
      idempotencyKey: `mcp:${'c'.repeat(64)}`
    }))
    expect(h.deps.appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: OWNER_ID,
      channel: 'mcp',
      routeOrTool: 'create_task'
    }))
    expect(h.deps.installInternalExecutionDelegator).toHaveBeenCalledWith(expect.objectContaining({
      event: authorityEvent,
      actorUserId: OWNER_ID,
      authority,
      correlationId: CORRELATION_ID,
      idempotencyKey: `mcp:${'c'.repeat(64)}`,
      routeOrTool: 'create_task'
    }))
    expect(h.calls.indexOf('delegation')).toBeLessThan(h.calls.indexOf('executor'))
  })

  it('persists an owner write-scope bypass in attempt, bypass, and outcome before dispatch', async () => {
    const idempotencyKey = `mcp:${'d'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })

    await createTrustedMcpGodModeToolExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'create_task',
      args: { title: 'Ship', clientId: CLIENT_ID },
      idempotencyKey,
      bypassedControls: ['confirmation', 'mcp_scope']
    })

    const audits = vi.mocked(h.deps.appendAudit).mock.calls.map(([audit]) => audit)
    expect(audits.map(audit => audit.phase)).toEqual(['attempt', 'bypass', 'succeeded'])
    expect(audits.every(audit => audit.bypassedControls.includes('mcp_scope'))).toBe(true)
    expect(h.calls.indexOf('bypass')).toBeLessThan(h.calls.indexOf('handler'))
    expect(h.calls.indexOf('bypass')).toBeLessThan(h.calls.indexOf('executor'))
  })

  it('audits and idempotently coordinates a supplemental provider mutation', async () => {
    const idempotencyKey = `mcp:${'e'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const provider = vi.fn(async () => ok({ assetId: 'asset-1' }))
    const executeResolved = createTrustedMcpGodModeResolvedMutationExecutor(h.deps)
    const request = {
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'generate_voiceover',
      args: { text: 'Ship it' },
      idempotencyKey,
      bypassedControls: ['confirmation', 'mcp_scope'],
      executeSupplemental: supplemental(provider),
      tool: {
        name: 'generate_voiceover',
        description: 'Generate a voiceover.',
        parameters: z.object({ text: z.string().min(2) }),
        mutates: true,
        handler: provider
      }
    }

    await expect(executeResolved(request as any)).resolves.toEqual(ok({ assetId: 'asset-1' }))
    await expect(executeResolved(request as any)).resolves.toMatchObject({ ok: true, data: { replayed: true } })

    expect(provider).toHaveBeenCalledTimes(1)
    const audits = vi.mocked(h.deps.appendAudit).mock.calls.map(([audit]) => audit)
    expect(audits.map(audit => audit.phase)).toEqual(['attempt', 'bypass', 'succeeded'])
    expect(audits.every(audit => audit.bypassedControls.includes('mcp_scope'))).toBe(true)
    expect(h.calls.indexOf('progress:dispatched')).toBeLessThan(h.calls.indexOf('progress:result_captured'))
  })

  it('requires the trusted runner to own exactly one real dispatch checkpoint', async () => {
    const idempotencyKey = `mcp:${'0'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const executeResolved = createTrustedMcpGodModeResolvedMutationExecutor(h.deps)
    const base = {
      event: authorityEvent, authenticatedUserId: OWNER_ID, authority, sessionDigest: 'b'.repeat(64),
      toolName: 'generate_voiceover', args: { text: 'Ship it' }, idempotencyKey,
      executionClass: 'external-provider' as const,
      tool: {
        name: 'generate_voiceover', description: 'Generate a voiceover.',
        parameters: z.object({ text: z.string() }), mutates: true,
        handler: vi.fn(async () => ok({ assetId: 'must-not-run' }))
      }
    }

    const withoutCheckpoint = await executeResolved({
      ...base,
      executeSupplemental: vi.fn(async () => ok({ assetId: 'asset-no-checkpoint' }))
    } as any)
    expect(withoutCheckpoint).toMatchObject({ ok: false })
    expect(h.calls).not.toContain('progress:dispatched')

    const secondKey = `mcp:${'8'.repeat(64)}`
    const ordered = harness({ expectedIdempotencyKey: secondKey })
    const run = vi.fn(async (_args: unknown, _ctx: unknown, services: any) => {
      ordered.calls.push('runner:prepared')
      await services.markDispatched()
      ordered.calls.push('provider:send')
      await services.captureResult(ok({ assetId: 'asset-8' }))
      ordered.calls.push('runner:return')
      return ok({ assetId: 'asset-8' })
    })
    await expect(createTrustedMcpGodModeResolvedMutationExecutor(ordered.deps)({
      ...base, idempotencyKey: secondKey, executeSupplemental: run
    } as any)).resolves.toEqual(ok({ assetId: 'asset-8' }))
    expect(ordered.calls.indexOf('runner:prepared')).toBeLessThan(ordered.calls.indexOf('progress:dispatched'))
    expect(ordered.calls.indexOf('progress:dispatched')).toBeLessThan(ordered.calls.indexOf('provider:send'))
    expect(ordered.calls.filter(call => call === 'progress:dispatched')).toHaveLength(1)
    expect(ordered.calls.filter(call => call === 'progress:result_captured')).toHaveLength(1)
  })

  it('fails a supplemental provider preflight before dispatch with no side effect', async () => {
    const idempotencyKey = `mcp:${'1'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const provider = vi.fn(async () => ok({ jobId: 'job-1' }))

    await expect(createTrustedMcpGodModeResolvedMutationExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'start_music_generation',
      args: { prompt: 'Warm acoustic bed' },
      idempotencyKey,
      tool: {
        name: 'start_music_generation',
        description: 'Start music generation.',
        parameters: z.object({ prompt: z.string() }),
        mutates: true,
        handler: provider
      },
      preflight: resolveGenerationMcpExecutions().find(row => row.name === 'start_music_generation')!.preflight
    } as any)).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Music generation provider is unavailable.' })

    expect(provider).not.toHaveBeenCalled()
    expect(h.calls).not.toContain('progress:dispatched')
    expect(h.ledger.get(idempotencyKey)?.state).toBe('failed')
    expect(h.deps.appendAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'failed', outcomeCode: 'provider_unavailable' }),
      expect.anything()
    )
  })

  it('marks music dispatched only after the real queue preflight and captures a queued result', async () => {
    const idempotencyKey = `mcp:${'7'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const send = vi.fn(async () => undefined)
    const authorityEvent = {
      ...event(),
      context: { cloudflare: { env: { MUSIC_QUEUE: { send } } } }
    } as any
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const provider = vi.fn(async () => {
      await send({ assetId: 'music-job-7' })
      return ok({ jobId: 'music-job-7', status: 'queued' })
    })
    const execution = resolveGenerationMcpExecutions().find(row => row.name === 'start_music_generation')!

    await expect(createTrustedMcpGodModeResolvedMutationExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'start_music_generation',
      args: { prompt: 'Warm acoustic bed' },
      idempotencyKey,
      executionClass: execution.executionClass,
      preflight: execution.preflight,
      executeSupplemental: supplemental(provider),
      tool: {
        ...execution.tool,
        parameters: z.object({ prompt: z.string() }),
        handler: provider
      }
    })).resolves.toEqual(ok({ jobId: 'music-job-7', status: 'queued' }))

    expect(send).toHaveBeenCalledTimes(1)
    expect(h.calls.indexOf('progress:dispatched')).toBeLessThan(h.calls.indexOf('progress:result_captured'))
    expect(h.ledger.get(idempotencyKey)).toMatchObject({ state: 'succeeded', resultReference: 'music-job-7' })
  })

  it('keeps a supplemental action ambiguous when dispatch throws and never redispatches on retry', async () => {
    const idempotencyKey = `mcp:${'2'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const provider = vi.fn(async () => { throw new Error('response lost after queue accepted') })
    const executeResolved = createTrustedMcpGodModeResolvedMutationExecutor(h.deps)
    const request = {
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'start_music_generation',
      args: { prompt: 'Warm acoustic bed' },
      idempotencyKey,
      executeSupplemental: supplemental(provider),
      tool: {
        name: 'start_music_generation', description: 'Start music generation.',
        parameters: z.object({ prompt: z.string() }), mutates: true, handler: provider
      }
    }

    await expect(executeResolved(request as any)).resolves.toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    await expect(executeResolved(request as any)).resolves.toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(h.calls).toContain('progress:dispatched')
    expect(h.ledger.get(idempotencyKey)?.state).toBe('ambiguous')
  })

  it('captures a supplemental result durably before terminal bookkeeping', async () => {
    const idempotencyKey = `mcp:${'3'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey, terminalError: new Error('terminal audit unavailable') })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const provider = vi.fn(async () => ok({ jobId: 'job-3', status: 'queued' }))
    const executeResolved = createTrustedMcpGodModeResolvedMutationExecutor(h.deps)
    const request = {
      event: authorityEvent, authenticatedUserId: OWNER_ID, authority, sessionDigest: 'b'.repeat(64),
      toolName: 'start_music_generation', args: { prompt: 'Warm acoustic bed' }, idempotencyKey,
      executeSupplemental: supplemental(provider),
      tool: {
        name: 'start_music_generation', description: 'Start music generation.',
        parameters: z.object({ prompt: z.string() }), mutates: true, handler: provider
      }
    }

    await expect(executeResolved(request as any)).resolves.toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    await expect(executeResolved(request as any)).resolves.toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(h.calls).toContain('progress:result_captured')
    expect(h.ledger.get(idempotencyKey)).toMatchObject({ state: 'ambiguous', resultReference: 'job-3' })
  })

  it('marks provider success ambiguous if durable result capture fails and never redispatches', async () => {
    const idempotencyKey = `mcp:${'4'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey, progressErrorAt: 'result_captured' })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const provider = vi.fn(async () => ok({ jobId: 'job-4', status: 'queued' }))
    const executeResolved = createTrustedMcpGodModeResolvedMutationExecutor(h.deps)
    const request = {
      event: authorityEvent, authenticatedUserId: OWNER_ID, authority, sessionDigest: 'b'.repeat(64),
      toolName: 'start_music_generation', args: { prompt: 'Warm acoustic bed' }, idempotencyKey,
      executeSupplemental: supplemental(provider),
      tool: {
        name: 'start_music_generation', description: 'Start music generation.',
        parameters: z.object({ prompt: z.string() }), mutates: true, handler: provider
      }
    }

    await expect(executeResolved(request as any)).resolves.toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    await expect(executeResolved(request as any)).resolves.toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(h.ledger.get(idempotencyKey)).toMatchObject({ state: 'ambiguous', resultReference: 'job-4' })
    expect(h.deps.setExecutionState).toHaveBeenCalledWith(expect.objectContaining({
      state: 'ambiguous',
      executionPhase: 'result_captured',
      resultReference: 'job-4',
      executionMetadata: expect.objectContaining({ supplemental: true })
    }), expect.anything())
  })

  it('commits a local supplemental mutation, success audit, and ledger outcome atomically and replays once', async () => {
    const idempotencyKey = `mcp:${'5'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    let committedWrites = 0
    vi.mocked(h.deps.transaction).mockImplementation(async callback => await callback({
      query: vi.fn(async (sql: string) => {
        if (!/^(SAVEPOINT|RELEASE SAVEPOINT)/.test(sql)) committedWrites++
        return { rows: [] }
      })
    } as any))
    const localMutation = vi.fn(async (_args, _ctx, db) => {
      h.calls.push('local-mutation')
      await db.query('INSERT memory', [])
      return ok({ remembered: true, id: 'memory-5' })
    })
    const executeResolved = createTrustedMcpGodModeResolvedMutationExecutor(h.deps)
    const request = {
      event: authorityEvent, authenticatedUserId: OWNER_ID, authority, sessionDigest: 'b'.repeat(64),
      toolName: 'remember', args: { content: 'Reports are in AUD' }, idempotencyKey,
      executionClass: 'local-transactional' as const,
      executeMutation: localMutation,
      tool: {
        name: 'remember', description: 'Remember a preference.',
        parameters: z.object({ content: z.string() }), mutates: true,
        handler: vi.fn(async () => { throw new Error('non-transactional handler must not run') })
      }
    }

    await expect(executeResolved(request as any)).resolves.toEqual(ok({ remembered: true, id: 'memory-5' }))
    await expect(executeResolved(request as any)).resolves.toMatchObject({ ok: true, data: { replayed: true } })
    expect(localMutation).toHaveBeenCalledTimes(1)
    // One memory write plus its transaction-bound ai_action_audit row.
    expect(committedWrites).toBe(2)
    expect(h.calls.indexOf('attempt')).toBeLessThan(h.calls.indexOf('local-mutation'))
  })

  it('durably audits local schema and cross-scope denials only after the immutable attempt', async () => {
    for (const scenario of ['schema', 'scope'] as const) {
      const idempotencyKey = `mcp:${(scenario === 'schema' ? '7' : '8').repeat(64)}`
      const h = harness({ expectedIdempotencyKey: idempotencyKey, scopeValid: scenario !== 'scope' })
      const authorityEvent = event()
      const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, { queryOneFresh: async () => ({ id: OWNER_ID }) })
      const mutation = vi.fn()
      const result = await createTrustedMcpGodModeResolvedMutationExecutor(h.deps)({
        event: authorityEvent, authenticatedUserId: OWNER_ID, authority, sessionDigest: 'b'.repeat(64),
        toolName: 'remember', args: scenario === 'schema' ? {} : { content: 'secret' }, idempotencyKey,
        tenantId: TENANT_ID, executionClass: 'local-transactional', executeMutation: mutation,
        tool: { name: 'remember', description: '', parameters: z.object({ content: z.string() }), mutates: true, handler: vi.fn() }
      } as any)
      expect(result.ok).toBe(false)
      expect(h.calls.indexOf('attempt')).toBeLessThan(scenario === 'scope' ? h.calls.indexOf('scope') : h.calls.indexOf('failed'))
      expect(h.calls).toContain('failed')
      expect(h.ledger.get(idempotencyKey)?.state).toBe('failed')
      expect(h.deps.setExecutionState).toHaveBeenCalledWith(expect.objectContaining({
        state: 'failed',
        executionPhase: 'claimed'
      }), expect.anything())
      expect(mutation).not.toHaveBeenCalled()
    }
  })

  it('rolls back only the local mutation savepoint, then commits a failed terminal outcome', async () => {
    const idempotencyKey = `mcp:${'d'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const sql: string[] = []
    vi.mocked(h.deps.transaction).mockImplementation(async callback => callback({
      query: vi.fn(async statement => { sql.push(statement); return { rows: [], rowCount: 1 } })
    } as any))
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, { queryOneFresh: async () => ({ id: OWNER_ID }) })
    const result = await createTrustedMcpGodModeResolvedMutationExecutor(h.deps)({
      event: authorityEvent, authenticatedUserId: OWNER_ID, authority, sessionDigest: 'b'.repeat(64),
      toolName: 'remember', args: { content: 'Reports are AUD' }, idempotencyKey,
      executionClass: 'local-transactional', executeMutation: vi.fn(async () => { throw new Error('mutation unavailable') }),
      tool: { name: 'remember', description: '', parameters: z.object({ content: z.string() }), mutates: true, handler: vi.fn() }
    } as any)
    expect(result.ok).toBe(false)
    expect(sql).toEqual(expect.arrayContaining([
      'SAVEPOINT god_mode_local_mutation',
      'ROLLBACK TO SAVEPOINT god_mode_local_mutation',
      'RELEASE SAVEPOINT god_mode_local_mutation'
    ]))
    expect(h.calls).toContain('failed')
    expect(h.ledger.get(idempotencyKey)?.state).toBe('failed')
  })

  it('serializes concurrent owner remember calls so one wins and the other replays', async () => {
    const idempotencyKey = `mcp:${'a'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    let tail = Promise.resolve()
    vi.mocked(h.deps.transaction).mockImplementation(async callback => {
      const previous = tail
      let release!: () => void
      tail = new Promise<void>(resolve => { release = resolve })
      await previous
      try {
        return await callback({ query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } as any)
      } finally {
        release()
      }
    })
    const localMutation = vi.fn(async () => ok({ remembered: true, id: 'memory-concurrent' }))
    const request = {
      event: authorityEvent, authenticatedUserId: OWNER_ID, authority, sessionDigest: 'b'.repeat(64),
      toolName: 'remember', args: { content: 'Reports are in AUD' }, idempotencyKey,
      executionClass: 'local-transactional' as const,
      executeMutation: localMutation,
      tool: {
        name: 'remember', description: 'Remember a preference.',
        parameters: z.object({ content: z.string() }), mutates: true, handler: vi.fn()
      }
    }
    const executeResolved = createTrustedMcpGodModeResolvedMutationExecutor(h.deps)

    const results = await Promise.all([executeResolved(request as any), executeResolved(request as any)])
    expect(results).toEqual(expect.arrayContaining([
      ok({ remembered: true, id: 'memory-concurrent' }),
      expect.objectContaining({ ok: true, data: expect.objectContaining({ replayed: true }) })
    ]))
    expect(localMutation).toHaveBeenCalledTimes(1)
  })

  it('rolls a local owner mutation claim back with audit failure and lets one retry commit', async () => {
    const idempotencyKey = `mcp:${'6'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    let committedWrites = 0
    let stagedWrites = 0
    let successAuditAttempts = 0
    vi.mocked(h.deps.appendAudit).mockImplementation(async input => {
      h.calls.push(input.phase === 'attempt' ? 'attempt' : input.phase)
      if (input.phase === 'succeeded' && successAuditAttempts++ === 0) throw new Error('audit unavailable')
    })
    vi.mocked(h.deps.transaction).mockImplementation(async callback => {
      const ledgerSnapshot = new Map(h.ledger)
      stagedWrites = 0
      try {
        const result = await callback({ query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } as any)
        committedWrites += stagedWrites
        return result
      } catch (error) {
        h.ledger.clear()
        for (const [key, value] of ledgerSnapshot) h.ledger.set(key, value)
        throw error
      }
    })
    const localMutation = vi.fn(async () => {
      stagedWrites++
      return ok({ remembered: true, id: 'memory-6' })
    })
    const executeResolved = createTrustedMcpGodModeResolvedMutationExecutor(h.deps)
    const request = {
      event: authorityEvent, authenticatedUserId: OWNER_ID, authority, sessionDigest: 'b'.repeat(64),
      toolName: 'remember', args: { content: 'Reports are in AUD' }, idempotencyKey,
      executionClass: 'local-transactional' as const,
      executeMutation: localMutation,
      tool: {
        name: 'remember', description: 'Remember a preference.',
        parameters: z.object({ content: z.string() }), mutates: true, handler: vi.fn()
      }
    }

    await expect(executeResolved(request as any)).resolves.toMatchObject({ ok: false })
    expect(h.ledger.has(idempotencyKey)).toBe(false)
    await expect(executeResolved(request as any)).resolves.toMatchObject({ ok: true })
    await expect(executeResolved(request as any)).resolves.toMatchObject({ ok: true, data: { replayed: true } })
    expect(localMutation).toHaveBeenCalledTimes(2)
    expect(committedWrites).toBe(1)
    expect(h.ledger.get(idempotencyKey)?.state).toBe('succeeded')
  })

  it('does not reach a supplemental provider when its attempt audit insert fails', async () => {
    const h = harness({ attemptError: new Error('audit unavailable') })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const provider = vi.fn(async () => ok({ assetId: 'asset-1' }))

    await expect(createTrustedMcpGodModeResolvedMutationExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'generate_voiceover',
      args: { text: 'Ship it' },
      idempotencyKey: `mcp:${'f'.repeat(64)}`,
      bypassedControls: ['confirmation', 'mcp_scope'],
      tool: {
        name: 'generate_voiceover',
        description: 'Generate a voiceover.',
        parameters: z.object({ text: z.string().min(2) }),
        mutates: true,
        handler: provider
      }
    })).rejects.toMatchObject({ statusCode: 503, statusMessage: 'God mode audit unavailable' })

    expect(provider).not.toHaveBeenCalled()
  })

  it('replays a completed MCP ledger result without redispatching the write', async () => {
    const idempotencyKey = `mcp:${'9'.repeat(64)}`
    const h = harness({ expectedIdempotencyKey: idempotencyKey })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const execute = createTrustedMcpGodModeToolExecutor(h.deps)
    const request = {
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'create_task',
      args: { title: 'Ship', clientId: CLIENT_ID },
      idempotencyKey,
      tenantId: TENANT_ID,
      clientId: CLIENT_ID
    }

    await expect(execute(request)).resolves.toMatchObject({ ok: true, data: { directExecution: true } })
    await expect(execute(request)).resolves.toMatchObject({ ok: true, data: { replayed: true } })

    expect(h.sideEffects()).toBe(1)
    expect(h.calls.filter(call => call === 'executor')).toHaveLength(1)
  })

  it('audits a trusted MCP read with the stable identity but creates no mutation-ledger row', async () => {
    const h = harness()
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const readTool = {
      name: 'get_tasks',
      parameters: z.object({ clientId: z.string().uuid() }),
      handler: vi.fn(async () => ok({ count: 1 }))
    } as any
    const result = await createTrustedMcpGodModeReadExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'd'.repeat(64),
      idempotencyKey: `mcp:${'e'.repeat(64)}`,
      tool: readTool,
      args: { clientId: CLIENT_ID },
      ctx: { userId: OWNER_ID, userRole: 'owner', event: authorityEvent, source: 'mcp' }
    })

    expect(result).toEqual({ ok: true, data: { count: 1 } })
    expect(h.deps.claimExecution).not.toHaveBeenCalled()
    expect(h.deps.appendAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      channel: 'mcp',
      phase: 'attempt',
      routeOrTool: 'get_tasks',
      clientId: null,
      correlationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    }))
    expect(h.deps.appendAudit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      channel: 'mcp', phase: 'succeeded', routeOrTool: 'get_tasks', clientId: null
    }))
  })

  it('rejects a structural clone before an MCP ledger or audit claim', async () => {
    const h = harness({ expectedIdempotencyKey: `mcp:${'c'.repeat(64)}` })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })

    await expect(createTrustedMcpGodModeToolExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority: { ...authority } as any,
      sessionDigest: 'b'.repeat(64),
      toolName: 'create_task',
      args: { title: 'Ship' },
      idempotencyKey: `mcp:${'c'.repeat(64)}`
    })).rejects.toMatchObject({ statusCode: 403 })

    expect(h.deps.claimExecution).not.toHaveBeenCalled()
    expect(h.deps.appendAudit).not.toHaveBeenCalled()
  })

  it('audits and rejects an MCP tenant mismatch before invoking the read handler', async () => {
    const h = harness({ scopeValid: false })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })
    const handler = vi.fn(async () => ok({ count: 1 }))
    const result = await createTrustedMcpGodModeReadExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'f'.repeat(64),
      idempotencyKey: `mcp:${'a'.repeat(64)}`,
      tool: { name: 'get_finance', parameters: z.object({ tenantId: z.string().uuid() }), handler } as any,
      args: { tenantId: OTHER_ID },
      ctx: { userId: OWNER_ID, userRole: 'owner', event: authorityEvent, source: 'mcp' },
      tenantId: TENANT_ID
    })

    expect(result).toEqual({ ok: false, error: 'Target is outside the authenticated scope.' })
    expect(handler).not.toHaveBeenCalled()
    expect(h.deps.appendAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      channel: 'mcp', phase: 'failed', outcomeCode: 'tenant_mismatch'
    }))
  })

  it.each([
    ['finance', 'propose_expense_approval'],
    ['social publishing', 'propose_schedule_post'],
    ['creative/banner', 'propose_proof_status'],
    ['CRM/administration', 'propose_opportunity'],
    ['task writes', 'create_task']
  ])('executes %s without surfacing a confirmation card', async (_family, toolName) => {
    const h = harness({ toolName })
    const result = await h.execute({
      event: event(), conversationId: 'conversation-1', toolName,
      args: { title: 'Ship', clientId: CLIENT_ID }, idempotencyKey: 'message-7:tool-call-2',
      tenantId: TENANT_ID, clientId: CLIENT_ID
    })

    expect(result).toEqual({ ok: true, data: { resultRef: `${toolName}-result`, summary: `executed ${toolName}`, directExecution: true } })
    expect(h.calls).toEqual([
      'authority', 'ledger', 'attempt', 'scope', 'handler', 'proposal', 'progress:dispatched', 'executor',
      'succeeded', 'ledger:succeeded'
    ])
    expect(JSON.stringify(result)).not.toContain('proposalId')
    expect(JSON.stringify(result)).not.toContain('confirm_action')
  })

  it('validates the tool schema after the durable attempt and before the handler', async () => {
    const h = harness()
    const result = await h.execute({
      event: event(), toolName: 'create_task', args: { title: '' },
      idempotencyKey: 'message-7:tool-call-2'
    })
    expect(result).toEqual({ ok: false, error: 'Invalid tool input.' })
    expect(h.calls.slice(0, 3)).toEqual(['authority', 'ledger', 'attempt'])
    expect(h.calls).not.toContain('handler')
    expect(h.calls).not.toContain('executor')
  })

  it('fails closed before handler/provider when the attempt audit cannot persist', async () => {
    const h = harness({ attemptError: new Error('database secret') })
    await expect(h.execute({ event: event(), toolName: 'create_task', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' }))
      .rejects.toMatchObject({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
    expect(h.calls).toEqual(['authority', 'ledger', 'attempt', 'ledger:failed'])
    expect(h.sideEffects()).toBe(0)
  })

  it('records a bounded failed outcome and sanitizes executor failures', async () => {
    const h = harness({ executorError: markTrustedPreDispatchError(new Error('provider token=secret'), 'executor_failed') })
    await expect(h.execute({ event: event(), toolName: 'create_task', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' }))
      .rejects.toMatchObject({ statusCode: 502, statusMessage: 'God mode action failed' })
    expect(h.deps.appendAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'failed', outcomeCode: 'executor_failed' }),
      expect.anything()
    )
    expect(JSON.stringify(vi.mocked(h.deps.appendAudit).mock.calls)).not.toContain('provider token')
  })

  it('returns only a generic audit failure if the failed terminal cannot persist', async () => {
    const h = harness({
      executorError: markTrustedPreDispatchError(new Error('provider token=secret'), 'executor_failed'),
      failedAuditError: new Error('db password')
    })
    await expect(h.execute({ event: event(), toolName: 'create_task', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' }))
      .rejects.toMatchObject({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
  })

  it('rejects tenant/client mismatch after attempt and before handler/executor', async () => {
    const h = harness({ scopeValid: false })
    const result = await h.execute({
      event: event(), toolName: 'create_task', args: { title: 'Ship', clientId: OTHER_ID },
      idempotencyKey: 'message-7:tool-call-2', tenantId: TENANT_ID, clientId: OTHER_ID
    })
    expect(result).toEqual({ ok: false, error: 'Target is outside the authenticated scope.' })
    expect(h.calls).not.toContain('handler')
    expect(h.calls).not.toContain('executor')
  })

  it('keeps terminal audit identity equal to the immutable attempt when scope is resolved later', async () => {
    const h = harness()
    await h.execute({
      event: event(), toolName: 'create_task', args: { title: 'Ship', clientId: CLIENT_ID },
      idempotencyKey: 'message-7:tool-call-2'
    })

    const attempt = vi.mocked(h.deps.appendAudit).mock.calls.find(([input]) => input.phase === 'attempt')?.[0]
    const terminal = vi.mocked(h.deps.appendAudit).mock.calls.find(([input]) => input.phase === 'succeeded')?.[0]
    expect({
      actorUserId: terminal?.actorUserId,
      sessionDigest: terminal?.sessionDigest,
      channel: terminal?.channel,
      routeOrTool: terminal?.routeOrTool,
      tenantId: terminal?.tenantId ?? null,
      clientId: terminal?.clientId ?? null,
      entityType: terminal?.entityType ?? null,
      entityId: terminal?.entityId ?? null,
      bypassedControls: terminal?.bypassedControls,
      emergencyDisabled: terminal?.emergencyDisabled
    }).toEqual({
      actorUserId: attempt?.actorUserId,
      sessionDigest: attempt?.sessionDigest,
      channel: attempt?.channel,
      routeOrTool: attempt?.routeOrTool,
      tenantId: attempt?.tenantId ?? null,
      clientId: attempt?.clientId ?? null,
      entityType: attempt?.entityType ?? null,
      entityId: attempt?.entityId ?? null,
      bypassedControls: attempt?.bypassedControls,
      emergencyDisabled: attempt?.emergencyDisabled
    })
  })

  it('derives the actor from requireAuth and ignores actor-looking args', async () => {
    const h = harness({ actorId: OTHER_ID, authorityActive: false })
    await expect(h.execute({
      event: event(OTHER_ID), toolName: 'create_task',
      args: { title: 'Ship', actorUserId: OWNER_ID, role: 'owner', email: 'owner@example.test' },
      idempotencyKey: 'message-7:tool-call-2'
    })).rejects.toMatchObject({ statusCode: 403, statusMessage: 'God mode is not active' })
    expect(h.deps.resolveGodModeAuthority).toHaveBeenCalledWith(expect.anything(), OTHER_ID)
    expect(h.deps.claimExecution).not.toHaveBeenCalled()
  })

  it('re-resolves authority on the next request so a role downgrade blocks execution', async () => {
    const h = harness()
    vi.mocked(h.deps.resolveGodModeAuthority)
      .mockResolvedValueOnce({ active: true, actorUserId: OWNER_ID, reason: 'active_owner', emergencyDisabled: false } as any)
      .mockResolvedValueOnce({ active: false, actorUserId: OWNER_ID, reason: 'inactive_or_missing', emergencyDisabled: false } as any)
    await h.execute({ event: event(), toolName: 'create_task', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' })
    await expect(h.execute({ event: event(), toolName: 'create_task', args: { title: 'Again' }, idempotencyKey: 'message-8:tool-call-1' }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(h.sideEffects()).toBe(1)
  })

  it('returns the bounded recorded result for a completed transport retry', async () => {
    const h = harness()
    const request = { event: event(), toolName: 'create_task', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' }
    await h.execute(request)
    const replay = await h.execute(request)
    expect(replay).toEqual({ ok: true, data: { resultRef: 'create_task-result', replayed: true } })
    expect(h.sideEffects()).toBe(1)
  })

  it('fails closed on a duplicate correlation claim without leaking database details', async () => {
    const h = harness()
    vi.mocked(h.deps.claimExecution).mockRejectedValue(Object.assign(new Error('duplicate key table=secret'), { code: '23505' }))
    await expect(h.execute({
      event: event(), toolName: 'create_task', args: { title: 'Ship' },
      idempotencyKey: 'message-7:tool-call-2'
    })).rejects.toMatchObject({ statusCode: 503, statusMessage: 'God mode execution ledger unavailable' })
    expect(h.sideEffects()).toBe(0)
  })

  it.each(['in_progress', 'ambiguous'] as const)('never automatically re-executes an existing %s claim', async state => {
    const h = harness()
    h.ledger.set('message-7:tool-call-2', {
      actorUserId: OWNER_ID, channel: 'application', idempotencyKey: 'message-7:tool-call-2', state,
      correlationId: CORRELATION_ID, routeOrTool: 'create_task', executorClass: 'internal-http',
      tenantId: null, clientId: null, resultReference: null, resultDigest: null
    })
    const result = await h.execute({ event: event(), toolName: 'create_task', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' })
    expect(result).toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    expect(h.sideEffects()).toBe(0)
  })

  it('allows only one concurrent double-submit to execute', async () => {
    const h = harness()
    const request = { event: event(), toolName: 'create_task', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' }
    const [a, b] = await Promise.all([h.execute(request), h.execute(request)])
    expect([a.ok, b.ok].sort()).toEqual([false, true])
    expect(h.sideEffects()).toBe(1)
  })

  it('blocks replay after provider success when success audit persistence fails', async () => {
    const h = harness({ toolName: 'propose_schedule_post', terminalError: new Error('database unavailable') })
    const request = { event: event(), toolName: 'propose_schedule_post', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' }
    const first = await h.execute(request)
    const retry = await h.execute(request)
    expect(first).toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    expect(retry).toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    expect(h.sideEffects()).toBe(1)
    expect(h.ledger.get(request.idempotencyKey)?.state).toBe('ambiguous')
    expect(h.deps.enqueueTerminalAudit).toHaveBeenCalledTimes(1)
  })

  it('classifies an internal HTTP rejection as ambiguous because the endpoint may have committed', async () => {
    const h = harness({
      executorError: new Error('response lost after commit'),
      executorErrorAfterDispatch: true
    })
    const result = await h.execute({
      event: event(), toolName: 'create_task', args: { title: 'Ship' },
      idempotencyKey: 'message-7:tool-call-2'
    })

    expect(result).toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    expect(h.ledger.get('message-7:tool-call-2')?.state).toBe('ambiguous')
    expect(h.sideEffects()).toBe(1)
    expect(h.deps.appendAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'ambiguous', outcomeCode: 'dispatch_outcome_unknown' }),
      expect.anything()
    )
  })

  it.each([
    ['auth 401 before the route handler', 401, false],
    ['handler 403 after a side effect', 403, true],
    ['handler 409 after a side effect', 409, true],
    ['handler 409 with an untrusted preDispatch field after a side effect', 409, true, true]
  ])('conservatively classifies %s as ambiguous without authenticated rejection provenance', async (_label, statusCode, afterDispatch, forgedPreDispatch = false) => {
    const idempotencyKey = `mcp:${String(statusCode).repeat(64).slice(0, 64)}`
    const h = harness({
      expectedIdempotencyKey: idempotencyKey,
      executorError: Object.assign(new Error('downstream authentication rejected'), {
        statusCode,
        ...(forgedPreDispatch ? { preDispatch: true } : {})
      }),
      executorErrorAfterDispatch: afterDispatch
    })
    const authorityEvent = event()
    const authority = await resolveGodModeAuthority(authorityEvent, OWNER_ID, {
      queryOneFresh: async () => ({ id: OWNER_ID })
    })

    await expect(createTrustedMcpGodModeToolExecutor(h.deps)({
      event: authorityEvent,
      authenticatedUserId: OWNER_ID,
      authority,
      sessionDigest: 'b'.repeat(64),
      toolName: 'create_task',
      args: { title: 'Ship', clientId: CLIENT_ID },
      idempotencyKey,
      tenantId: TENANT_ID,
      clientId: CLIENT_ID
    })).resolves.toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })

    expect(h.ledger.get(idempotencyKey)?.state).toBe('ambiguous')
    expect(h.sideEffects()).toBe(afterDispatch ? 1 : 0)
    expect(h.deps.appendAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'ambiguous', outcomeCode: 'dispatch_outcome_unknown' }),
      expect.anything()
    )
  })

  it('captures the returned reference before proposal bookkeeping and marks bookkeeping failure ambiguous', async () => {
    const h = harness()
    vi.mocked(h.deps.completeProposal).mockRejectedValue(new Error('database response lost'))

    const result = await h.execute({
      event: event(), toolName: 'create_task', args: { title: 'Ship' },
      idempotencyKey: 'message-7:tool-call-2'
    })

    expect(result).toEqual({ ok: false, error: 'Action outcome is pending reconciliation.' })
    expect(h.ledger.get('message-7:tool-call-2')).toMatchObject({
      state: 'ambiguous',
      resultReference: 'create_task-result'
    })
    expect(h.sideEffects()).toBe(1)
  })

  it('marks proposals as server-only preparation and durably associates them before claim', async () => {
    const h = harness()
    const associateProposal = vi.fn().mockResolvedValue(undefined)
    ;(h.deps as any).associateProposal = associateProposal
    vi.mocked(h.deps.resolveTool).mockReturnValue({
      name: 'create_task',
      parameters: z.object({ title: z.string() }),
      mutates: true,
      handler: vi.fn(async (_args, ctx) => {
        expect(ctx.source).toBe('god_mode_preparation')
        return ok({ proposalId: 'proposal-1' })
      })
    } as any)

    await h.execute({
      event: event(), conversationId: 'conversation-1', toolName: 'create_task', args: { title: 'Ship' },
      idempotencyKey: 'message-7:tool-call-2'
    })

    expect(associateProposal).toHaveBeenCalledWith(expect.objectContaining({
      proposalId: 'proposal-1',
      actorUserId: OWNER_ID,
      idempotencyKey: 'message-7:tool-call-2'
    }))
    expect(associateProposal.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(h.deps.claimProposal).mock.invocationCallOrder[0]!
    )
  })

  it('dismisses a hidden preparation and never dispatches when durable association fails', async () => {
    const h = harness()
    const dismissProposals = vi.fn().mockResolvedValue(undefined)
    ;(h.deps as any).associateProposal = vi.fn().mockRejectedValue(new Error('association unavailable'))
    ;(h.deps as any).dismissProposals = dismissProposals

    const result = await h.execute({
      event: event(), conversationId: 'conversation-1', toolName: 'create_task', args: { title: 'Ship' },
      idempotencyKey: 'message-7:tool-call-2'
    })

    expect(result).toEqual({ ok: false, error: 'Could not prepare the action.' })
    expect(dismissProposals).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: OWNER_ID,
      idempotencyKey: 'message-7:tool-call-2'
    }))
    expect(h.sideEffects()).toBe(0)
  })

  it('rolls a local mutation and success audit back together', async () => {
    let committed = 0
    const h = harness({ executionClass: 'local-transactional', terminalError: new Error('audit insert failed') })
    vi.mocked(h.deps.transaction).mockImplementation(async callback => {
      const services = { query: vi.fn(async () => { committed++; return { rows: [] } }) } as any
      try {
        return await callback(services)
      } catch (error) {
        committed = 0
        throw error
      }
    })
    const result = await h.execute({ event: event(), toolName: 'create_task', args: { title: 'Ship' }, idempotencyKey: 'message-7:tool-call-2' })
    expect(result.ok).toBe(false)
    expect(committed).toBe(0)
    expect(h.ledger.get('message-7:tool-call-2')?.state).toBe('failed')
  })
})

describe('executor durability classification', () => {
  it('classifies every registered executor explicitly and keeps HTTP calls off fake DB transactions', () => {
    const classes = Object.fromEntries(Object.entries(executors).map(([name, executor]) => [name, executor.executionClass]))
    expect(classes).toMatchObject({
      create_task: 'internal-http',
      propose_schedule_post: 'internal-http',
      propose_expense_approval: 'internal-http',
      propose_proof_status: 'internal-http',
      propose_opportunity: 'internal-http',
      propose_knowledge_article: 'local-transactional',
      propose_team_memory: 'local-transactional',
      link_social_conversation_task: 'local-transactional'
    })
    expect(Object.values(classes).every(value => ['local-transactional', 'internal-http', 'external-provider'].includes(String(value)))).toBe(true)
    expect(Object.entries(classes).filter(([, value]) => value === 'internal-http').map(([name]) => name).sort()).toEqual([
      'assign_task',
      'create_task',
      'log_crm_activity',
      'propose_brief_convert',
      'propose_budget_alert',
      'propose_budget_change',
      'propose_eom_generate',
      'propose_expense_approval',
      'propose_expense_classify',
      'propose_opportunity',
      'propose_proof_status',
      'propose_quote',
      'propose_schedule_post',
      'propose_status_change'
    ])
    expect(Object.entries(classes).filter(([, value]) => value === 'local-transactional').map(([name]) => name).sort()).toEqual([
      'create_social_case_task',
      'link_social_conversation_task',
      'propose_knowledge_article',
      'propose_team_memory'
    ])
  })
})

describe('God mode chat mutation family', () => {
  it('activates only the persisted conversation messages route family', () => {
    const unregister = registerGodModeChatMutationFamily()
    expect(listRegisteredGodModeMutationFamilies()).toEqual([
      { family: 'ai-chat-direct-execution', method: 'POST' }
    ])
    unregister()
  })
})
