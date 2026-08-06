import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import {
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const testGlobal = globalThis as Record<string, unknown>
testGlobal.defineEventHandler = <T>(handler: T) => handler
testGlobal.defineNitroPlugin = <T>(plugin: T) => plugin

const {
  executeGodModeBannerRender,
  prepareGodModeBannerRender
} = await import(
  '../../../server/utils/banner/godModeRender'
)

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const FIRST_CORRELATION = '22222222-2222-4222-8222-222222222222'
const SECOND_CORRELATION = '33333333-3333-4333-8333-333333333333'
const JOB_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_DIGEST = 'a'.repeat(64)
const ROUTE = 'POST /api/agency/banner-studio/export-video'

function event(
  correlationId: string,
  headers: Record<string, string> = { 'idempotency-key': 'banner-render:attempt-1' }
): H3Event {
  const request = {
    method: 'POST',
    context: {},
    node: {
      req: {
        originalUrl: '/api/agency/banner-studio/export-video',
        headers: { host: 'app.xeroflow.test', ...headers },
        connection: {}
      },
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

function harness(order?: string[]) {
  let ledger: {
    state: string
    correlation_id: string
    route_or_tool: string
    execution_phase: string
    request_digest: string
    job_ids: string[] | null
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
          job_ids: null
        }
      }
      return { ...ledger, claimed }
    }
    if (sql.includes('jsonb_build_object(\'jobIds\'')) {
      if (!ledger || ledger.state !== 'in_progress' || ledger.execution_phase !== 'claimed' || ledger.job_ids) return null
      ledger.job_ids = JSON.parse(String(params[3]))
      return { job_ids: ledger.job_ids }
    }
    if (sql.includes('SET execution_phase = \'dispatched\'')) {
      if (!ledger || ledger.execution_phase !== 'claimed') return null
      ledger.execution_phase = 'dispatched'
      order?.push('checkpoint')
      return { state: ledger.state }
    }
    if (sql.startsWith('SELECT state')) return ledger ? { ...ledger } : null
    throw new Error(`Unexpected query: ${sql}`)
  })
  const terminalQuery = vi.fn(async (_sql: string, params: unknown[] = []) => {
    if (!ledger || ledger.state !== 'in_progress' || ledger.correlation_id !== params[2]) return { rows: [] }
    ledger.state = String(params[3])
    if (ledger.state === 'succeeded') ledger.execution_phase = 'result_captured'
    return { rows: [{ state: ledger.state }] }
  })
  const transaction = vi.fn(async (callback: (db: { query: typeof terminalQuery }) => Promise<void>) => {
    await callback({ query: terminalQuery })
  })
  const dependencies = {
    queryOneFresh: query,
    transaction,
    appendAudit: vi.fn(async (audit: Record<string, unknown>) => {
      audits.push(audit)
    }),
    digestRequest: vi.fn(async () => REQUEST_DIGEST),
    randomUUID: vi.fn(() => JOB_ID)
  } as never
  return {
    audits,
    dependencies,
    terminalQuery,
    get ledger() {
      return ledger
    }
  }
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

describe('banner video God mode coordination', () => {
  it('rejects a missing Idempotency-Key before touching the execution ledger', async () => {
    const state = harness()

    await expect(prepareGodModeBannerRender(event(FIRST_CORRELATION, {}), state.dependencies)).rejects.toMatchObject({
      statusCode: 428,
      statusMessage: 'A valid Idempotency-Key header is required for God mode banner renders'
    })
    expect(state.dependencies.queryOneFresh).not.toHaveBeenCalled()
  })

  it('casts both PostgreSQL terminal-state parameter uses as VARCHAR', async () => {
    const state = harness()
    const request = event(FIRST_CORRELATION)
    const coordination = await prepareGodModeBannerRender(request, state.dependencies)
    await executeGodModeBannerRender(request, 1, async (genId, markDispatched) => {
      const jobId = genId()
      await markDispatched()
      return { jobIds: [jobId] }
    })

    await coordination.persistTerminal(terminal(FIRST_CORRELATION, 'succeeded'))

    const sql = String(state.terminalQuery.mock.calls[0]?.[0])
    expect(sql.match(/\$4::VARCHAR/g) ?? []).toHaveLength(2)
  })

  it('fences an unknown queue-send outcome as ambiguous and never redispatches on retry', async () => {
    const state = harness()
    const first = event(FIRST_CORRELATION)
    const coordination = await prepareGodModeBannerRender(first, state.dependencies)
    const send = vi.fn().mockRejectedValue(new Error('queue response lost'))

    await expect(executeGodModeBannerRender(first, 1, async (genId, markDispatched) => {
      const jobId = genId()
      await markDispatched()
      await send({ jobId })
      return { jobIds: [jobId] }
    })).rejects.toThrow('queue response lost')
    await coordination.persistTerminal(terminal(FIRST_CORRELATION, 'failed'))

    expect(state.ledger).toMatchObject({ state: 'ambiguous', execution_phase: 'dispatched' })
    expect(state.audits).toContainEqual(expect.objectContaining({
      phase: 'ambiguous',
      outcomeCode: 'dispatch_outcome_unknown'
    }))

    const retry = event(SECOND_CORRELATION)
    await expect(prepareGodModeBannerRender(retry, state.dependencies)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'God mode banner render is not safely replayable'
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it('replays durable job ids without requiring another queue dispatch', async () => {
    const state = harness()
    const first = event(FIRST_CORRELATION)
    const coordination = await prepareGodModeBannerRender(first, state.dependencies)
    const send = vi.fn().mockResolvedValue(undefined)

    await expect(executeGodModeBannerRender(first, 1, async (genId, markDispatched) => {
      const jobId = genId()
      await markDispatched()
      await send({ jobId })
      return { jobIds: [jobId] }
    })).resolves.toEqual({ jobIds: [JOB_ID] })
    await coordination.persistTerminal(terminal(FIRST_CORRELATION, 'succeeded'))

    const retry = event(SECOND_CORRELATION)
    const replayCoordination = await prepareGodModeBannerRender(retry, state.dependencies)
    const render = vi.fn()
    await expect(executeGodModeBannerRender(retry, 1, render)).resolves.toEqual({ jobIds: [JOB_ID] })
    await replayCoordination.persistTerminal(terminal(SECOND_CORRELATION, 'succeeded'))

    expect(render).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledOnce()
    expect(state.ledger).toMatchObject({ state: 'succeeded', execution_phase: 'result_captured' })
  })

  it('the route checkpoints immediately before its queue send', async () => {
    vi.resetModules()
    const body = {
      projectId: '55555555-5555-4555-8555-555555555555',
      formats: [{ key: 'mrec', html: '<main>Banner</main>', width: 300, height: 250 }],
      fps: 30,
      quality: 1,
      crf: 23
    }
    const order: string[] = []
    const enqueue = vi.fn(async (_input, dependencies) => {
      order.push('prepared')
      const jobId = dependencies.genId()
      await dependencies.sendQueue({ jobId })
      return { jobIds: [jobId] }
    })
    vi.doMock('h3', async importOriginal => ({
      ...await importOriginal<typeof import('h3')>(),
      readBody: vi.fn(async () => body)
    }))
    vi.doMock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: ACTOR_ID })) }))
    vi.doMock('~~/server/utils/storage', () => ({ uploadFile: vi.fn() }))
    vi.doMock('~~/server/utils/db', async importOriginal => ({
      ...await importOriginal<typeof import('~~/server/utils/db')>(),
      execute: vi.fn()
    }))
    vi.doMock('~~/server/utils/banner/renderJob', async importOriginal => ({
      ...await importOriginal<typeof import('~~/server/utils/banner/renderJob')>(),
      enqueueBannerRender: enqueue
    }))

    const featureGate = await import('../../../server/utils/godMode/featureGate')
    const coordinator = await import('../../../server/utils/banner/godModeRender')
    const handler = (await import('../../../server/api/agency/banner-studio/export-video.post')).default
    const request = event(FIRST_CORRELATION)
    featureGate.seedGodModeRouteAuditState(request, {
      actorUserId: ACTOR_ID,
      correlationId: FIRST_CORRELATION,
      sessionDigest: 'b'.repeat(64),
      routeOrTool: ROUTE,
      emergencyDisabled: false
    })
    ;(request.context as Record<string, unknown>).cloudflare = {
      env: { BANNER_RENDER_QUEUE: { send: vi.fn(async () => { order.push('send') }) } }
    }
    const state = harness(order)
    const coordination = await coordinator.prepareGodModeBannerRender(request, state.dependencies)

    await expect(handler(request)).resolves.toEqual({ jobIds: [JOB_ID] })
    await coordination.persistTerminal(terminal(FIRST_CORRELATION, 'succeeded'))

    expect(order).toEqual(['prepared', 'checkpoint', 'send'])
    vi.doUnmock('h3')
    vi.doUnmock('~~/server/utils/auth')
    vi.doUnmock('~~/server/utils/storage')
    vi.doUnmock('~~/server/utils/db')
    vi.doUnmock('~~/server/utils/banner/renderJob')
  })

  it('fails closed without sending when dispatch checkpoint ownership changes', async () => {
    const state = harness()
    const request = event(FIRST_CORRELATION)
    await prepareGodModeBannerRender(request, state.dependencies)
    const send = vi.fn()

    await expect(executeGodModeBannerRender(request, 1, async (genId, markDispatched) => {
      const jobId = genId()
      const ledger = state.ledger
      if (!ledger) throw new Error('expected claimed ledger')
      ledger.execution_phase = 'dispatched'
      await markDispatched()
      await send({ jobId })
      return { jobIds: [jobId] }
    })).rejects.toThrow('Banner render dispatch checkpoint unavailable')

    expect(send).not.toHaveBeenCalled()
  })

  it('eager plugin wiring admits the route before its request handler executes', async () => {
    vi.resetModules()
    const featureGate = await import('../../../server/utils/godMode/featureGate')
    const prepare = vi.fn(async () => ({
      strategy: 'task5-execution-ledger' as const,
      prepared: true as const,
      persistTerminal: vi.fn()
    }))
    vi.doMock('~~/server/utils/banner/godModeRender', () => ({
      prepareGodModeBannerRender: prepare
    }))
    vi.doMock('~~/server/utils/ai/godModeMutationFamily', () => ({ registerGodModeChatMutationFamily: vi.fn() }))
    vi.doMock('~~/server/utils/banner/godModeAssetUpload', () => ({ registerGodModeBannerAssetUploadFamily: vi.fn() }))
    vi.doMock('~~/server/utils/banner/godModeProjectCreation', () => ({ registerGodModeBannerProjectCreationFamily: vi.fn() }))

    await import('../../../server/plugins/godModeExecution')
    const { handleGodModeRequest } = await import('../../../server/middleware/godMode')
    const request = event(FIRST_CORRELATION)
    ;(request.context as Record<string, unknown>).user = { id: ACTOR_ID }
    const appendAttempt = vi.fn().mockResolvedValue(undefined)

    await expect(handleGodModeRequest(request, {
      resolveGodModeAuthority: vi.fn().mockResolvedValue({
        active: true,
        actorUserId: ACTOR_ID,
        reason: 'active_owner',
        emergencyDisabled: false
      }),
      appendGodModeAuditEvent: appendAttempt,
      getSessionToken: () => 'session-token',
      randomUUID: () => FIRST_CORRELATION
    } as never)).resolves.toBeUndefined()

    expect(prepare).toHaveBeenCalledOnce()
    expect(appendAttempt).toHaveBeenCalledOnce()
    expect(featureGate.getGodModeRouteAuditState(request)?.mutationCoordination).toMatchObject({
      strategy: 'task5-execution-ledger',
      route: '/api/agency/banner-studio/export-video'
    })
    vi.doUnmock('~~/server/utils/banner/godModeRender')
    vi.doUnmock('~~/server/utils/ai/godModeMutationFamily')
    vi.doUnmock('~~/server/utils/banner/godModeAssetUpload')
    vi.doUnmock('~~/server/utils/banner/godModeProjectCreation')
  })
})
