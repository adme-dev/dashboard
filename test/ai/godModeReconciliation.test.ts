import { describe, expect, it, vi } from 'vitest'

import {
  reconcileGodModeExecutions,
  type GodModeReconciliationDependencies,
  type ReconciliationCandidate
} from '~~/server/utils/godMode/reconciliation'
import * as reconciliationModule from '~~/server/utils/godMode/reconciliation'
import { sendGodModeAuditTerminal } from '~~/server/utils/queue'
import { processJob } from '~~/server/utils/queueConsumer'
import { ROUTES } from '../../workers/pages-cron/src/index'
import type { GodModeAuditEventInput } from '~~/server/utils/godMode/audit'

const candidate = (over: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate => ({
  actorUserId: '11111111-1111-4111-8111-111111111111',
  channel: 'application',
  correlationId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: 'message-7:tool-call-2',
  state: 'ambiguous',
  routeOrTool: 'propose_schedule_post',
  executorClass: 'internal-http',
  sessionDigest: 'a'.repeat(64),
  tenantId: null,
  clientId: null,
  resultReference: 'post-7',
  ...over
})

const attempt = (over: Partial<GodModeAuditEventInput> = {}): GodModeAuditEventInput => ({
  actorUserId: candidate().actorUserId,
  correlationId: candidate().correlationId,
  sessionDigest: candidate().sessionDigest,
  channel: candidate().channel,
  routeOrTool: candidate().routeOrTool,
  phase: 'attempt',
  tenantId: null,
  clientId: null,
  entityType: null,
  entityId: null,
  bypassedControls: ['confirmation'],
  outcomeCode: 'started',
  emergencyDisabled: false,
  ...over
})

function harness(status: 'succeeded' | 'failed' | 'unknown' = 'succeeded') {
  const candidates = [candidate()]
  const deps: GodModeReconciliationDependencies = {
    listCandidates: vi.fn(async () => candidates),
    findTerminal: vi.fn(async () => null),
    findAttempt: vi.fn(async () => attempt()),
    lookupOutcome: vi.fn(async () => status === 'unknown'
      ? { state: 'unknown' }
      : { state: status, resultReference: status === 'succeeded' ? 'post-7' : null }),
    appendTerminalAndClose: vi.fn(async () => true),
    markAlertable: vi.fn(async () => undefined)
  }
  return { deps, run: () => reconcileGodModeExecutions(deps, { limit: 25 }) }
}

describe('God mode reconciliation', () => {
  it('reconciles an ambiguous MCP write only against its matching MCP attempt identity', async () => {
    const h = harness('succeeded')
    const mcpCandidate = candidate({
      channel: 'mcp',
      idempotencyKey: `mcp:${'a'.repeat(64)}`
    })
    vi.mocked(h.deps.listCandidates).mockResolvedValue([mcpCandidate])
    vi.mocked(h.deps.findAttempt).mockResolvedValue(attempt({ channel: 'mcp' }))

    await expect(h.run()).resolves.toEqual({ scanned: 1, reconciled: 1, unknown: 0, failed: 0 })
    expect(h.deps.appendTerminalAndClose).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'mcp' }),
      expect.objectContaining({ channel: 'mcp', phase: 'succeeded' })
    )
  })

  it.each(['succeeded', 'failed'] as const)('closes a provider-confirmed %s outcome without repeating the action', async status => {
    const h = harness(status)
    const result = await h.run()
    expect(result).toEqual({ scanned: 1, reconciled: 1, unknown: 0, failed: 0 })
    expect(h.deps.lookupOutcome).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'message-7:tool-call-2' }))
    expect(h.deps.appendTerminalAndClose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phase: status }))
  })

  it('leaves an unknown outcome blocked and alertable', async () => {
    const h = harness('unknown')
    const result = await h.run()
    expect(result).toEqual({ scanned: 1, reconciled: 0, unknown: 1, failed: 0 })
    expect(h.deps.markAlertable).toHaveBeenCalledWith(expect.anything(), 'provider_outcome_unknown')
    expect(h.deps.appendTerminalAndClose).not.toHaveBeenCalled()
  })

  it('never reconciles a dispatched supplemental execution to failed without a bounded provider result', async () => {
    const lookup = reconciliationModule.lookupGodModeExecutionOutcome
    await expect(lookup(candidate({
      channel: 'mcp',
      routeOrTool: 'start_music_generation',
      state: 'ambiguous',
      executionPhase: 'dispatched',
      executionMetadata: { supplemental: true },
      resultReference: null
    }))).resolves.toEqual({ state: 'unknown' })
  })

  it('reconciles a captured supplemental result by its bounded durable reference', async () => {
    const lookup = reconciliationModule.lookupGodModeExecutionOutcome
    await expect(lookup(candidate({
      channel: 'mcp',
      routeOrTool: 'start_music_generation',
      state: 'ambiguous',
      executionPhase: 'result_captured',
      executionMetadata: { supplemental: true },
      resultReference: 'music-job-7'
    }), {
      getAudioAsset: vi.fn(async () => ({ id: 'music-job-7', status: 'queued' }))
    } as any)).resolves.toEqual({ state: 'succeeded', resultReference: 'music-job-7' })
  })

  it('keeps a captured music result unknown when bounded provider lookup cannot find the job', async () => {
    const lookup = reconciliationModule.lookupGodModeExecutionOutcome
    await expect(lookup(candidate({
      channel: 'mcp',
      routeOrTool: 'start_music_generation',
      state: 'ambiguous',
      executionPhase: 'result_captured',
      executionMetadata: { supplemental: true },
      resultReference: 'music-job-missing'
    }), {
      getAudioAsset: vi.fn(async () => null)
    } as any)).resolves.toEqual({ state: 'unknown' })
  })

  it('looks up a dispatched music reference instead of treating the reference as generic success', async () => {
    const lookup = reconciliationModule.lookupGodModeExecutionOutcome
    const getAudioAsset = vi.fn(async () => ({ id: 'music-job-dispatched', status: 'queued' }))
    await expect(lookup(candidate({
      channel: 'mcp',
      routeOrTool: 'start_music_generation',
      state: 'ambiguous',
      executionPhase: 'dispatched',
      resultReference: 'music-job-dispatched'
    }), { getAudioAsset } as any)).resolves.toEqual({
      state: 'succeeded', resultReference: 'music-job-dispatched'
    })
    expect(getAudioAsset).toHaveBeenCalledWith('music-job-dispatched')
  })

  it('keeps a dispatched music reference unknown when provider lookup cannot find it', async () => {
    const lookup = reconciliationModule.lookupGodModeExecutionOutcome
    await expect(lookup(candidate({
      channel: 'mcp',
      routeOrTool: 'start_music_generation',
      state: 'ambiguous',
      executionPhase: 'dispatched',
      resultReference: 'music-job-missing'
    }), { getAudioAsset: vi.fn(async () => null) } as any)).resolves.toEqual({ state: 'unknown' })
  })

  it('is idempotent when a terminal already exists', async () => {
    const h = harness()
    vi.mocked(h.deps.findTerminal).mockResolvedValue({ phase: 'succeeded', outcomeCode: 'executed' })
    await h.run()
    expect(h.deps.lookupOutcome).not.toHaveBeenCalled()
    expect(h.deps.appendTerminalAndClose).toHaveBeenCalledWith(expect.anything(), null)
  })

  it('bounds provider lookup outages and keeps the row blocked', async () => {
    const h = harness()
    vi.mocked(h.deps.lookupOutcome).mockRejectedValue(new Error('provider token secret'))
    const result = await h.run()
    expect(result).toEqual({ scanned: 1, reconciled: 0, unknown: 0, failed: 1 })
    expect(h.deps.markAlertable).toHaveBeenCalledWith(expect.anything(), 'provider_lookup_failed')
  })

  it('constructs a terminal from the immutable attempt when ledger client scope was resolved later', async () => {
    const h = harness('succeeded')
    const resolvedClient = '33333333-3333-4333-8333-333333333333'
    vi.mocked(h.deps.listCandidates).mockResolvedValue([candidate({ clientId: resolvedClient })])
    vi.mocked(h.deps.findAttempt).mockResolvedValue(attempt({
      clientId: null,
      entityType: 'task',
      entityId: '44444444-4444-4444-8444-444444444444'
    }))

    const result = await h.run()

    expect(result).toEqual({ scanned: 1, reconciled: 1, unknown: 0, failed: 0 })
    expect(h.deps.lookupOutcome).toHaveBeenCalledWith(expect.objectContaining({ clientId: resolvedClient }))
    expect(h.deps.appendTerminalAndClose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      clientId: null,
      entityType: 'task',
      entityId: '44444444-4444-4444-8444-444444444444',
      phase: 'succeeded'
    }))
  })

  it('does not look up or append when the immutable attempt is missing', async () => {
    const h = harness()
    vi.mocked(h.deps.findAttempt).mockResolvedValue(null)

    const result = await h.run()

    expect(result).toEqual({ scanned: 1, reconciled: 0, unknown: 0, failed: 1 })
    expect(h.deps.lookupOutcome).not.toHaveBeenCalled()
    expect(h.deps.appendTerminalAndClose).not.toHaveBeenCalled()
    expect(h.deps.markAlertable).toHaveBeenCalledWith(expect.anything(), 'attempt_identity_missing')
  })

  it('does not look up or append when immutable attempt identity conflicts with the ledger', async () => {
    const h = harness()
    vi.mocked(h.deps.findAttempt).mockResolvedValue(attempt({ routeOrTool: 'create_task' }))

    const result = await h.run()

    expect(result).toEqual({ scanned: 1, reconciled: 0, unknown: 0, failed: 1 })
    expect(h.deps.lookupOutcome).not.toHaveBeenCalled()
    expect(h.deps.appendTerminalAndClose).not.toHaveBeenCalled()
    expect(h.deps.markAlertable).toHaveBeenCalledWith(expect.anything(), 'attempt_identity_mismatch')
  })

  it('uses the strict direct Queue producer without a DB job-ledger prerequisite', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const request = { context: { cloudflare: { env: { JOBS_QUEUE: { send } } } } } as any
    const terminal = {
      actorUserId: candidate().actorUserId,
      correlationId: candidate().correlationId,
      sessionDigest: 'a'.repeat(64),
      channel: 'application' as const,
      routeOrTool: 'propose_schedule_post',
      phase: 'succeeded' as const,
      bypassedControls: ['confirmation' as const],
      outcomeCode: 'executed',
      emergencyDisabled: false
    }
    await expect(sendGodModeAuditTerminal(request, terminal)).resolves.toBe(true)
    expect(send).toHaveBeenCalledWith({ type: 'god-mode.audit-terminal', payload: terminal }, { contentType: 'json' })
  })

  it('rejects malformed terminal jobs so Queue retry/dead-letter remains visible', async () => {
    await expect(processJob({
      type: 'god-mode.audit-terminal',
      payload: { correlationId: 'not-a-uuid', secret: 'must-not-pass' }
    } as any)).rejects.toThrow()
  })

  it('preserves existing cron routes while adding bounded reconciliation', () => {
    expect(ROUTES['*/5 * * * *']).toEqual(expect.arrayContaining([
      '/api/cron/office-assistant',
      '/api/cron/video-generation-reconcile',
      '/api/cron/god-mode-reconciliation'
    ]))
    expect(ROUTES['0 * * * *']).toContain('/api/cron/anomaly-detection')
  })

  it('repairs only the persisted social link after verifying the existing task', async () => {
    const repair = (reconciliationModule as any).repairSocialCaseTaskLink
    expect(repair).toBeTypeOf('function')
    if (typeof repair !== 'function') return

    const findTask = vi.fn().mockResolvedValue({ id: 'task-7' })
    const findConversation = vi.fn().mockResolvedValue({ id: 'conversation-7', linkedTaskId: null })
    const linkExistingTask = vi.fn().mockResolvedValue(true)
    const outcome = await repair({
      compositePhase: 'task_created',
      taskId: 'task-7',
      socialConversationId: 'conversation-7',
      clientId: 'client-7'
    }, candidate().actorUserId, { findTask, findConversation, linkExistingTask })

    expect(outcome).toEqual({ state: 'succeeded', resultReference: 'task-7' })
    expect(findTask).toHaveBeenCalledWith('task-7')
    expect(linkExistingTask).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-7', socialConversationId: 'conversation-7', actorUserId: candidate().actorUserId
    }))
  })

  it('never treats a social task id alone as success when no durable link metadata exists', async () => {
    const lookup = (reconciliationModule as any).lookupGodModeExecutionOutcome
    expect(lookup).toBeTypeOf('function')
    if (typeof lookup !== 'function') return

    const outcome = await lookup(candidate({
      routeOrTool: 'create_social_case_task',
      resultReference: 'task-7',
      executionPhase: 'task_created',
      executionMetadata: null
    }))

    expect(outcome).toEqual({ state: 'unknown' })
  })
})
