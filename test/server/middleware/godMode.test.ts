import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '../../../server/utils/godMode/featureGate'

const { resolveGodModeAuthority, appendGodModeAuditEvent } = vi.hoisted(() => ({
  resolveGodModeAuthority: vi.fn(),
  appendGodModeAuditEvent: vi.fn()
}))

vi.mock('../../../server/utils/godMode/authority', () => ({ resolveGodModeAuthority }))
vi.mock('../../../server/utils/godMode/audit', () => ({ appendGodModeAuditEvent }))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
}
testGlobal.defineEventHandler = handler => handler

const { handleGodModeRequest } = await import('../../../server/middleware/godMode')

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222'

function event(path = '/api/agency/clients', method = 'GET') {
  return {
    method,
    context: {
      user: {
        id: OWNER_ID,
        email: 'forged@example.com',
        role: 'owner',
        is_active: true
      }
    },
    headers: {
      authorization: 'Bearer session-secret'
    },
    path,
    node: {
      req: {
        originalUrl: path,
        headers: { host: 'app.xeroflow.test' },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
}

const dependencies = {
  resolveGodModeAuthority,
  appendGodModeAuditEvent,
  getPath: (request: any) => request.path,
  getSessionToken: (request: any) => request.headers.authorization.slice(7),
  randomUUID: () => CORRELATION_ID
}

describe('God mode request middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: OWNER_ID,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    appendGodModeAuditEvent.mockResolvedValue(undefined)
  })

  it('persists one bounded attempt for every authenticated active-owner staff API request', async () => {
    const request = event()

    await handleGodModeRequest(request, dependencies)

    expect(resolveGodModeAuthority).toHaveBeenCalledWith(request, OWNER_ID)
    expect(appendGodModeAuditEvent).toHaveBeenCalledTimes(1)
    expect(appendGodModeAuditEvent).toHaveBeenCalledWith({
      actorUserId: OWNER_ID,
      correlationId: CORRELATION_ID,
      sessionDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      channel: 'application',
      routeOrTool: 'GET /api/agency/clients',
      phase: 'attempt',
      bypassedControls: [],
      outcomeCode: 'started',
      emergencyDisabled: false
    })
    expect(appendGodModeAuditEvent.mock.calls[0][0].sessionDigest).not.toContain('session-secret')
  })

  it('blocks the route when attempt persistence fails', async () => {
    appendGodModeAuditEvent.mockRejectedValue(new Error('database unavailable'))

    await expect(handleGodModeRequest(event(), dependencies)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'God mode audit unavailable'
    })
  })

  it('fails closed before an active-owner mutation handler when no exact coordinator family is registered', async () => {
    await expect(handleGodModeRequest(event('/api/agency/clients', 'POST'), dependencies as any)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'God mode mutation coordination required'
    })
    expect(appendGodModeAuditEvent).toHaveBeenCalledOnce()
  })

  it('does nothing for authenticated users without active owner authority', async () => {
    resolveGodModeAuthority.mockResolvedValue({
      active: false,
      actorUserId: OWNER_ID,
      reason: 'emergency_disabled',
      emergencyDisabled: true
    })

    await handleGodModeRequest(event(), dependencies)

    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })

  it.each([
    '/api/public/contact',
    '/api/health',
    '/api/internal/mcp/call',
    '/api/mcp/authorize',
    '/_nuxt/app.js',
    '/features'
  ])('excludes %s before resolving authority', async (path) => {
    await handleGodModeRequest(event(path), dependencies)
    expect(resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })

  it('uses canonical pathname so query strings do not defeat an exact exclusion', async () => {
    await handleGodModeRequest(event('/api/health?probe=1'), dependencies as any)
    expect(resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })

  it('does not exclude a prefix-collision route', async () => {
    await handleGodModeRequest(event('/api/webhooks-admin'), dependencies as any)
    expect(resolveGodModeAuthority).toHaveBeenCalledOnce()
    expect(appendGodModeAuditEvent).toHaveBeenCalledOnce()
  })

  it('matches a registered mutation family against canonical pathname without its query string', async () => {
    const prepare = vi.fn().mockResolvedValue({
      strategy: 'task5-execution-ledger',
      prepared: true,
      persistTerminal: vi.fn()
    })
    const unregister = registerGodModeMutationFamily({
      family: 'query-canonicalization',
      method: 'POST',
      matchesPath: path => path === '/api/agency/clients',
      prepare
    })
    const request = event('/api/agency/clients?retry=1', 'POST')

    await handleGodModeRequest(request, dependencies as any)

    expect(prepare).toHaveBeenCalledOnce()
    expect(getGodModeRouteAuditState(request)?.mutationCoordination?.route).toBe('/api/agency/clients')
    unregister()
  })

  it('resolves authority only from event.context.user.id', async () => {
    const request = event()
    request.headers['x-god-mode-user'] = '33333333-3333-4333-8333-333333333333'
    request.context.godMode = { active: true, actorUserId: '44444444-4444-4444-8444-444444444444' }

    await handleGodModeRequest(request, dependencies)

    expect(resolveGodModeAuthority).toHaveBeenCalledWith(request, OWNER_ID)
  })
})
