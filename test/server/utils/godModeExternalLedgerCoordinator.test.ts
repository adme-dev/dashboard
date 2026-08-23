import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import { seedGodModeRouteAuditState, prepareRegisteredGodModeMutation } from '../../../server/utils/godMode/featureGate'

const testGlobal = globalThis as Record<string, unknown>
testGlobal.defineEventHandler = <T>(handler: T) => handler
testGlobal.defineNitroPlugin = <T>(plugin: T) => plugin

const { executeGodModeExternalMutation, prepareGodModeExternalMutation } = await import(
  '../../../server/utils/godMode/externalLedgerCoordinator'
)
const {
  isMediaRenderPath,
  isMediaUploadPath,
  isVideoGenerationPath,
  registerGodModeMediaExternalMutationFamilies
} = await import('../../../server/utils/audio/godModeExternalMutations')

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const FIRST = '22222222-2222-4222-8222-222222222222'
const SECOND = '33333333-3333-4333-8333-333333333333'
const JOB_ID = '44444444-4444-4444-8444-444444444444'
const DIGEST = 'a'.repeat(64)
const PROJECT = 'eca5685a-14bf-411b-ad35-53394f6bbb44'
const ROUTE = `POST /api/agency/audio/projects/${PROJECT}/render-video`
const MUTATION = { label: 'video render', coordinationKey: Symbol('test-render') }

function event(correlationId: string, headers: Record<string, string> = { 'idempotency-key': 'media-render:attempt-1' }): H3Event {
  const request = {
    method: 'POST',
    context: {},
    node: {
      req: { originalUrl: `/api/agency/audio/projects/${PROJECT}/render-video`, headers: { host: 'app.xeroflow.test', ...headers }, connection: {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(request, {
    actorUserId: ACTOR_ID,
    correlationId,
    sessionDigest: 'b'.repeat(64),
    routeOrTool: ROUTE,
    emergencyDisabled: false
  })
  return request
}

function harness() {
  let ledger: {
    state: string
    correlation_id: string
    route_or_tool: string
    execution_phase: string
    request_digest: string
    ids: string[] | null
    result: unknown
  } | null = null
  const audits: Array<Record<string, unknown>> = []
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('WITH claimed AS')) {
      const claimed = !ledger
      if (!ledger) {
        ledger = {
          state: 'in_progress',
          correlation_id: String(params[2]),
          route_or_tool: String(params[3]),
          execution_phase: 'claimed',
          request_digest: String(params[5]),
          ids: null,
          result: null
        }
      }
      return { ...ledger, claimed }
    }
    if (sql.includes("jsonb_build_object('ids'")) {
      if (!ledger || ledger.state !== 'in_progress' || ledger.execution_phase !== 'claimed' || ledger.ids) return null
      ledger.ids = JSON.parse(String(params[3]))
      return { ids: ledger.ids }
    }
    if (sql.includes("execution_phase='dispatched'")) {
      if (!ledger || ledger.execution_phase !== 'claimed') return null
      ledger.execution_phase = 'dispatched'
      return { state: ledger.state }
    }
    throw new Error(`Unexpected query: ${sql}`)
  })
  const terminalQuery = vi.fn(async (_sql: string, params: unknown[] = []) => {
    if (!ledger || ledger.state !== 'in_progress' || ledger.correlation_id !== params[2]) return { rows: [] }
    ledger.state = String(params[3])
    ledger.result = JSON.parse(String(params[6]))
    if (ledger.state === 'succeeded') ledger.execution_phase = 'result_captured'
    return { rows: [{ state: ledger.state }] }
  })
  const transaction = vi.fn(async (callback: (db: { query: typeof terminalQuery }) => Promise<void>) => {
    await callback({ query: terminalQuery })
  })
  const dependencies = {
    queryOneFresh: query,
    transaction,
    appendAudit: vi.fn(async (audit: Record<string, unknown>) => { audits.push(audit) }),
    digestRequest: vi.fn(async () => DIGEST),
    randomUUID: vi.fn(() => JOB_ID)
  } as never
  return { audits, dependencies, get ledger() { return ledger } }
}

function terminal(correlationId: string, phase: 'succeeded' | 'failed') {
  return {
    actorUserId: ACTOR_ID,
    correlationId,
    sessionDigest: 'b'.repeat(64),
    channel: 'application' as const,
    routeOrTool: ROUTE,
    phase,
    bypassedControls: [],
    outcomeCode: phase === 'succeeded' ? 'http_2xx' : 'http_5xx',
    emergencyDisabled: false
  }
}

describe('God mode external-provider ledger coordinator', () => {
  it('rejects a missing Idempotency-Key before touching the ledger', async () => {
    const state = harness()
    await expect(prepareGodModeExternalMutation(event(FIRST, {}), MUTATION, state.dependencies)).rejects.toMatchObject({
      statusCode: 428,
      statusMessage: 'A valid Idempotency-Key header is required for God mode video render'
    })
    expect(state.ledger).toBeNull()
  })

  it('reserves the id before any side effect, checkpoints dispatch, stores the result, and replays it', async () => {
    const state = harness()
    const first = event(FIRST)
    const prepared = await prepareGodModeExternalMutation(first, MUTATION, state.dependencies)
    const sideEffects: string[] = []

    const result = await executeGodModeExternalMutation(first, MUTATION, 1, async (run) => {
      expect(run.replay).toBe(false)
      expect(run.ids).toEqual([JOB_ID])
      expect(state.ledger?.ids).toEqual([JOB_ID])
      sideEffects.push('enqueue')
      await run.markDispatched()
      expect(state.ledger?.execution_phase).toBe('dispatched')
      return { jobId: run.ids[0], status: 'queued' }
    })
    expect(result).toEqual({ jobId: JOB_ID, status: 'queued' })
    await prepared.persistTerminal(terminal(FIRST, 'succeeded'))
    expect(state.ledger?.state).toBe('succeeded')
    expect(state.ledger?.result).toEqual({ jobId: JOB_ID, status: 'queued' })

    // Same key again → replay without touching the provider.
    const second = event(SECOND)
    await prepareGodModeExternalMutation(second, MUTATION, state.dependencies)
    const replayed = await executeGodModeExternalMutation(second, MUTATION, 1, async (run) => {
      expect(run.replay).toBe(true)
      expect(run.ids).toEqual([JOB_ID])
      return run.replayResult
    })
    expect(replayed).toEqual({ jobId: JOB_ID, status: 'queued' })
    expect(sideEffects).toEqual(['enqueue'])
  })

  it('marks a failure after dispatch as ambiguous, and before dispatch as failed', async () => {
    const state = harness()
    const first = event(FIRST)
    const prepared = await prepareGodModeExternalMutation(first, MUTATION, state.dependencies)
    await expect(executeGodModeExternalMutation(first, MUTATION, 1, async (run) => {
      await run.markDispatched()
      throw new Error('provider exploded after accepting the job')
    })).rejects.toThrow('provider exploded')
    await prepared.persistTerminal(terminal(FIRST, 'failed'))
    expect(state.ledger?.state).toBe('ambiguous')
    expect(state.audits.at(-1)).toMatchObject({ phase: 'ambiguous', outcomeCode: 'dispatch_outcome_unknown' })

    // An ambiguous key is not replayable.
    await expect(prepareGodModeExternalMutation(event(SECOND), MUTATION, state.dependencies)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'God mode video render is not safely replayable'
    })

    const fresh = harness()
    const third = event(FIRST)
    const preparedFresh = await prepareGodModeExternalMutation(third, MUTATION, fresh.dependencies)
    await expect(executeGodModeExternalMutation(third, MUTATION, 1, async () => {
      throw new Error('validation failed before dispatch')
    })).rejects.toThrow('validation failed')
    await preparedFresh.persistTerminal(terminal(FIRST, 'failed'))
    expect(fresh.ledger?.state).toBe('failed')
  })

  it('runs straight through with fresh ids for ordinary staff (no coordination)', async () => {
    const plain = { context: {} } as unknown as H3Event
    const result = await executeGodModeExternalMutation(plain, MUTATION, 1, async (run) => {
      expect(run.replay).toBe(false)
      expect(run.ids[0]).toMatch(/^[0-9a-f-]{36}$/)
      return 'ok'
    })
    expect(result).toBe('ok')
  })
})

describe('media external mutation families', () => {
  it('matches exactly the render, upload and generation routes', () => {
    expect(isMediaRenderPath(`/api/agency/audio/projects/${PROJECT}/render-video`)).toBe(true)
    expect(isMediaRenderPath(`/api/agency/audio/projects/${PROJECT}/render`)).toBe(false)
    expect(isMediaUploadPath(`/api/agency/audio/projects/${PROJECT}/upload-media`)).toBe(true)
    expect(isVideoGenerationPath('/api/agency/video/generation/jobs')).toBe(true)
    expect(isVideoGenerationPath('/api/agency/video/generation/jobs/x')).toBe(false)
  })

  it('admits the three routes under God mode (key required) and wires the handlers + plugin', async () => {
    const unregister = registerGodModeMediaExternalMutationFamilies()
    try {
      await expect(prepareRegisteredGodModeMutation(event(FIRST, {}))).rejects.toMatchObject({ statusCode: 428 })
    } finally {
      unregister()
    }
    expect(readFileSync('server/api/agency/audio/projects/[id]/render-video.post.ts', 'utf8')).toContain('executeGodModeMediaRender')
    expect(readFileSync('server/api/agency/audio/projects/[id]/upload-media.post.ts', 'utf8')).toContain('executeGodModeMediaUpload')
    expect(readFileSync('server/api/agency/video/generation/jobs.post.ts', 'utf8')).toContain('executeGodModeVideoGeneration')
    expect(readFileSync('server/plugins/godModeExecution.ts', 'utf8')).toContain('registerGodModeMediaExternalMutationFamilies()')
    const editor = readFileSync('app/composables/useMediaProjectEditor.ts', 'utf8')
    expect(editor).toMatch(/render-video`,\s*\{[\s\S]*?'Idempotency-Key'/)
    expect(editor).toMatch(/upload-media`,\s*\{[\s\S]*?'Idempotency-Key'/)
    expect(readFileSync('app/components/media/MediaGenerateComposer.vue', 'utf8')).toContain("'Idempotency-Key': idempotencyKey")
  })
})
