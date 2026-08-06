import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineNitroPlugin: <T>(plugin: T) => T
}
testGlobal.defineNitroPlugin = plugin => plugin

const { persistGodModeTerminalAudit } = await import('../../../server/plugins/godModeAudit')
const {
  getGodModeRouteAuditState,
  recordGodModeBypassedControls,
  registerGodModeMutationCoordination,
  seedGodModeRouteAuditState
} = await import('../../../server/utils/godMode/featureGate')
const { resolveGodModeAuthority } = await import('../../../server/utils/godMode/authority')

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222'

function event(method = 'GET', queue?: { send: ReturnType<typeof vi.fn> }): H3Event {
  return {
    method,
    path: '/api/agency/clients',
    context: {
      user: { id: OWNER_ID },
      cloudflare: { env: { JOBS_QUEUE: queue } }
    },
    node: {
      req: {
        originalUrl: '/api/agency/clients',
        headers: { host: 'app.xeroflow.test' },
        connection: {}
      },
      res: {
        statusCode: 200,
        statusMessage: 'OK'
      }
    }
  } as unknown as H3Event
}

function seed(request: H3Event, appendGodModeAuditEvent = vi.fn().mockResolvedValue(undefined)) {
  seedGodModeRouteAuditState(request, {
    actorUserId: OWNER_ID,
    correlationId: CORRELATION_ID,
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `${request.method} /api/agency/clients`,
    emergencyDisabled: false
  }, {
    appendGodModeAuditEvent
  })
}

describe('God mode terminal audit plugin', () => {
  const appendGodModeAuditEvent = vi.fn()
  const setResponseStatus = vi.fn((request: H3Event, status: number, statusText: string) => {
    request.node.res.statusCode = status
    request.node.res.statusMessage = statusText
  })

  beforeEach(() => {
    vi.clearAllMocks()
    appendGodModeAuditEvent.mockResolvedValue(undefined)
  })

  it('appends exactly one successful terminal event without response content', async () => {
    const request = event()
    const response = { body: { secret: 'must never enter audit' } }
    seed(request, appendGodModeAuditEvent)

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })
    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(appendGodModeAuditEvent).toHaveBeenCalledTimes(1)
    expect(appendGodModeAuditEvent).toHaveBeenCalledWith({
      actorUserId: OWNER_ID,
      correlationId: CORRELATION_ID,
      sessionDigest: 'a'.repeat(64),
      channel: 'application',
      routeOrTool: 'GET /api/agency/clients',
      phase: 'succeeded',
      bypassedControls: [],
      outcomeCode: 'http_2xx',
      emergencyDisabled: false
    })
    expect(JSON.stringify(appendGodModeAuditEvent.mock.calls)).not.toContain('must never enter audit')
  })

  it('carries trusted runtime bypass controls into the immutable terminal event', async () => {
    const request = event()
    const response = { body: { ok: true } }
    seed(request, appendGodModeAuditEvent)
    await resolveGodModeAuthority(request, OWNER_ID, {
      queryOneFresh: vi.fn().mockResolvedValue({ id: OWNER_ID }),
      processEnv: {}
    })

    await recordGodModeBypassedControls(request, ['release_policy', 'budget', 'rate_limit'])
    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(appendGodModeAuditEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      actorUserId: OWNER_ID,
      correlationId: CORRELATION_ID,
      sessionDigest: 'a'.repeat(64),
      routeOrTool: 'GET /api/agency/clients',
      phase: 'bypass',
      outcomeCode: 'pre_execution',
      bypassedControls: ['budget', 'rate_limit', 'release_policy']
    }))
    expect(appendGodModeAuditEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      phase: 'succeeded',
      bypassedControls: ['release_policy', 'budget', 'rate_limit']
    }))
  })

  it('deduplicates repeated pre-execution persistence while retaining one terminal event', async () => {
    const request = event()
    const response = { body: { ok: true } }
    seed(request, appendGodModeAuditEvent)
    await resolveGodModeAuthority(request, OWNER_ID, {
      queryOneFresh: vi.fn().mockResolvedValue({ id: OWNER_ID }),
      processEnv: {}
    })

    await Promise.all([
      recordGodModeBypassedControls(request, ['rate_limit', 'budget']),
      recordGodModeBypassedControls(request, ['budget', 'rate_limit'])
    ])
    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })
    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    const phases = appendGodModeAuditEvent.mock.calls.map(([auditEvent]) => auditEvent.phase)
    expect(phases).toEqual(['bypass', 'succeeded'])
    expect(appendGodModeAuditEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      bypassedControls: ['budget', 'rate_limit']
    }))
  })

  it('fails closed and does not add terminal controls when pre-execution persistence fails', async () => {
    const request = event()
    seed(request, appendGodModeAuditEvent)
    await resolveGodModeAuthority(request, OWNER_ID, {
      queryOneFresh: vi.fn().mockResolvedValue({ id: OWNER_ID }),
      processEnv: {}
    })
    appendGodModeAuditEvent.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(recordGodModeBypassedControls(request, ['budget']))
      .rejects.toMatchObject({ statusCode: 503, statusMessage: 'God mode audit unavailable' })

    expect(appendGodModeAuditEvent).toHaveBeenCalledTimes(1)
    expect(getGodModeRouteAuditState(request)?.bypassedControls.size).toBe(0)
  })

  it('rejects route-state identity tampering instead of persisting a different correlation', async () => {
    const request = event()
    seed(request, appendGodModeAuditEvent)
    await resolveGodModeAuthority(request, OWNER_ID, {
      queryOneFresh: vi.fn().mockResolvedValue({ id: OWNER_ID }),
      processEnv: {}
    })
    getGodModeRouteAuditState(request)!.correlationId = '33333333-3333-4333-8333-333333333333'

    await expect(recordGodModeBypassedControls(request, ['budget']))
      .rejects.toMatchObject({ statusCode: 503 })
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })

  it('fails closed before execution when trusted route audit state is absent', async () => {
    const request = event()
    await resolveGodModeAuthority(request, OWNER_ID, {
      queryOneFresh: vi.fn().mockResolvedValue({ id: OWNER_ID }),
      processEnv: {}
    })

    await expect(recordGodModeBypassedControls(request, ['budget']))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('records a bounded failed terminal for an error response', async () => {
    const request = event()
    request.node.res.statusCode = 403
    const response = { body: new Error('contains provider secret') }
    seed(request, appendGodModeAuditEvent)

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'failed',
      outcomeCode: 'http_4xx'
    }))
    expect(JSON.stringify(appendGodModeAuditEvent.mock.calls)).not.toContain('provider secret')
  })

  it('sends the strict read terminal directly to JOBS_QUEUE when the database insert fails', async () => {
    const queue = { send: vi.fn().mockResolvedValue(undefined) }
    const request = event('GET', queue)
    const response = { body: { ok: true } }
    seed(request, appendGodModeAuditEvent)
    appendGodModeAuditEvent.mockRejectedValue(new Error('database unavailable'))

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(queue.send).toHaveBeenCalledTimes(1)
    expect(queue.send).toHaveBeenCalledWith({
      type: 'god-mode.audit-terminal',
      payload: expect.objectContaining({
        actorUserId: OWNER_ID,
        correlationId: CORRELATION_ID,
        phase: 'succeeded',
        outcomeCode: 'http_2xx'
      })
    }, { contentType: 'json' })
  })

  it('withholds a nominal success when terminal DB persistence and direct Queue fallback both fail', async () => {
    const queue = { send: vi.fn().mockRejectedValue(new Error('queue unavailable')) }
    const request = event('GET', queue)
    const response = { body: { ok: true, secret: 'do not leak' } }
    seed(request, appendGodModeAuditEvent)
    appendGodModeAuditEvent.mockRejectedValue(new Error('database unavailable'))

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(setResponseStatus).toHaveBeenCalledWith(request, 503, 'God mode audit unavailable')
    expect(response.body).toEqual({
      statusCode: 503,
      statusMessage: 'God mode audit unavailable'
    })
    expect(JSON.stringify(response.body)).not.toContain('do not leak')
  })

  it('never uses the read queue fallback for a mutation terminal', async () => {
    const queue = { send: vi.fn().mockResolvedValue(undefined) }
    const request = event('POST', queue)
    const response = { body: { ok: true } }
    seed(request, appendGodModeAuditEvent)
    appendGodModeAuditEvent.mockRejectedValue(new Error('database unavailable'))

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(queue.send).not.toHaveBeenCalled()
    expect(response.body).toMatchObject({ statusCode: 503 })
  })

  it('logs only bounded terminal diagnostics for a failed mutation audit', async () => {
    const request = event('POST')
    const response = { body: { ok: true, secret: 'response-secret' } }
    const persistenceError = Object.assign(new Error('query params contained a database secret'), {
      code: '08006',
      query: 'UPDATE secret_table SET token = $1'
    })
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    seed(request, appendGodModeAuditEvent)
    appendGodModeAuditEvent.mockRejectedValue(persistenceError)

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(diagnostic).toHaveBeenCalledWith('[God mode audit] terminal persistence failed', {
      correlationId: CORRELATION_ID,
      route: 'POST /api/agency/clients',
      stage: 'terminal_persistence',
      errorClass: 'Error',
      sqlState: '08006'
    })
    const emitted = JSON.stringify(diagnostic.mock.calls)
    expect(emitted).not.toContain('database secret')
    expect(emitted).not.toContain('secret_table')
    expect(emitted).not.toContain('response-secret')
    diagnostic.mockRestore()
  })

  it.each([
    [
      'a secret-like custom Error name',
      Object.assign(new Error('safe message'), { name: 'sk_live_secret_fragment' }),
      'Error',
      'sk_live_secret_fragment'
    ],
    [
      'a control-bearing object name',
      { name: 'Injected\nControl', code: '08006' },
      'unknown',
      'Injected'
    ]
  ])('maps %s to a fixed diagnostic category', async (_case, persistenceError, errorClass, forbidden) => {
    const request = event('POST')
    const response = { body: { ok: true } }
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    seed(request, appendGodModeAuditEvent)
    appendGodModeAuditEvent.mockRejectedValue(persistenceError)

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(diagnostic).toHaveBeenCalledWith('[God mode audit] terminal persistence failed', expect.objectContaining({
      errorClass
    }))
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(forbidden)
    diagnostic.mockRestore()
  })

  it('routes a prepared mutation terminal through its coordinator instead of direct DB persistence', async () => {
    const request = event('POST')
    const response = { body: { ok: true } }
    const persistTerminal = vi.fn().mockResolvedValue(undefined)
    seed(request, appendGodModeAuditEvent)
    registerGodModeMutationCoordination(request, {
      strategy: 'task5-execution-ledger',
      method: 'POST',
      route: '/api/agency/clients',
      prepared: true,
      persistTerminal
    })

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(persistTerminal).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'succeeded',
      outcomeCode: 'http_2xx'
    }))
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })
})
