import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineNitroPlugin: <T>(plugin: T) => T
}
testGlobal.defineNitroPlugin = plugin => plugin

const { persistGodModeTerminalAudit } = await import('../../../server/plugins/godModeAudit')
const {
  registerGodModeMutationCoordination,
  seedGodModeRouteAuditState
} = await import('../../../server/utils/godMode/featureGate')

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222'

function event(method = 'GET', queue?: { send: ReturnType<typeof vi.fn> }) {
  return {
    method,
    path: '/api/agency/clients',
    context: {
      cloudflare: { env: { JOBS_QUEUE: queue } }
    },
    node: {
      res: {
        statusCode: 200,
        statusMessage: 'OK'
      }
    }
  } as any
}

function seed(request: any) {
  seedGodModeRouteAuditState(request, {
    actorUserId: OWNER_ID,
    correlationId: CORRELATION_ID,
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `${request.method} /api/agency/clients`,
    emergencyDisabled: false
  })
}

describe('God mode terminal audit plugin', () => {
  const appendGodModeAuditEvent = vi.fn()
  const setResponseStatus = vi.fn((request: any, status: number, statusText: string) => {
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
    seed(request)

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

  it('records a bounded failed terminal for an error response', async () => {
    const request = event()
    request.node.res.statusCode = 403
    const response = { body: new Error('contains provider secret') }
    seed(request)

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
    seed(request)
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
    seed(request)
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
    seed(request)
    appendGodModeAuditEvent.mockRejectedValue(new Error('database unavailable'))

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(queue.send).not.toHaveBeenCalled()
    expect(response.body).toMatchObject({ statusCode: 503 })
  })

  it('routes a prepared mutation terminal through its coordinator instead of direct DB persistence', async () => {
    const request = event('POST')
    const response = { body: { ok: true } }
    const persistTerminal = vi.fn().mockResolvedValue(undefined)
    seed(request)
    registerGodModeMutationCoordination(request, {
      strategy: 'task5-execution-ledger',
      method: 'POST',
      route: '/api/agency/clients',
      prepared: true,
      persistTerminal
    }, current => current.path)

    await persistGodModeTerminalAudit(request, response, { appendGodModeAuditEvent, setResponseStatus })

    expect(persistTerminal).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'succeeded',
      outcomeCode: 'http_2xx'
    }))
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })
})
