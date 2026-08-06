import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '../../../server/utils/godMode/featureGate'
import { registerGodModeBannerAssetUploadFamily } from '../../../server/utils/banner/godModeAssetUpload'

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

type TestEvent = H3Event & {
  headers: Record<string, string>
  context: H3Event['context'] & { godMode?: { active: boolean, actorUserId: string } }
}

function event(path = '/api/agency/clients', method = 'GET', requestHeaders: Record<string, string> = {}) {
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
        headers: { host: 'app.xeroflow.test', ...requestHeaders },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as TestEvent
}

const dependencies = {
  resolveGodModeAuthority,
  appendGodModeAuditEvent,
  getSessionToken: (request: H3Event) => (request as TestEvent).headers.authorization!.slice(7),
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
    await expect(handleGodModeRequest(event('/api/agency/clients', 'POST'), dependencies)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'God mode mutation coordination required'
    })
    expect(appendGodModeAuditEvent).toHaveBeenCalledOnce()
  })

  it('admits the registered client portal access mutation for an active owner', async () => {
    const unregister = registerGodModeMutationFamily({
      family: 'client-portal-access-test',
      method: 'POST',
      matchesPath: path => path === '/api/agency/client-portal/access',
      prepare: async () => ({
        strategy: 'transaction-bound',
        prepared: true,
        persistTerminal: vi.fn()
      })
    })
    try {
      await expect(handleGodModeRequest(
        event('/api/agency/client-portal/access', 'POST', {
          'idempotency-key': 'portal-access-11111111-1111-4111-8111-111111111111'
        }),
        dependencies
      )).resolves.toBeUndefined()
    } finally {
      unregister()
    }
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
    await handleGodModeRequest(event('/api/health?probe=1'), dependencies)
    expect(resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })

  it('does not exclude a prefix-collision route', async () => {
    await handleGodModeRequest(event('/api/webhooks-admin'), dependencies)
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

    await handleGodModeRequest(request, dependencies)

    expect(prepare).toHaveBeenCalledOnce()
    expect(getGodModeRouteAuditState(request)?.mutationCoordination?.route).toBe('/api/agency/clients')
    unregister()
  })

  it('preserves a trusted 428 from the real asset-upload coordinator', async () => {
    const transaction = vi.fn()
    const unregister = registerGodModeBannerAssetUploadFamily({
      transaction,
      appendAudit: vi.fn(),
      deleteBannerFile: vi.fn(),
      queryOneFresh: vi.fn()
    } as never)
    try {
      await expect(handleGodModeRequest(
        event('/api/agency/banner-studio/assets/upload', 'POST'),
        dependencies as never
      )).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: 'A stable Idempotency-Key header is required for God mode banner asset uploads'
      })
      expect(transaction).not.toHaveBeenCalled()
    } finally {
      unregister()
    }
  })

  it('preserves a trusted 409 conflict from the real asset-upload coordinator', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      return {
        rows: [{
          state: 'succeeded',
          result_reference: '33333333-3333-4333-8333-333333333333',
          route_or_tool: 'POST /api/agency/banner-studio/assets/upload',
          request_digest: 'c'.repeat(64)
        }]
      }
    })
    const transaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query }))
    const unregister = registerGodModeBannerAssetUploadFamily({
      transaction,
      appendAudit: vi.fn(),
      deleteBannerFile: vi.fn(),
      queryOneFresh: vi.fn()
    } as never)
    try {
      await expect(handleGodModeRequest(event(
        '/api/agency/banner-studio/assets/upload',
        'POST',
        {
          'idempotency-key': 'banner-upload-12345678',
          'x-banner-upload-digest': 'b'.repeat(64)
        }
      ), dependencies as never)).rejects.toMatchObject({
        statusCode: 409,
        statusMessage: 'Idempotency key request does not match'
      })
    } finally {
      unregister()
    }
  })

  it('does not expose an arbitrary status-shaped coordinator error', async () => {
    const unregister = registerGodModeMutationFamily({
      family: 'untrusted-status-shape',
      method: 'POST',
      matchesPath: path => path === '/api/agency/clients',
      prepare: async () => {
        throw { statusCode: 409, statusMessage: 'internal conflict detail' }
      }
    })
    try {
      await expect(handleGodModeRequest(event('/api/agency/clients', 'POST'), dependencies as never))
        .rejects.toMatchObject({
          statusCode: 503,
          statusMessage: 'God mode mutation coordination unavailable'
        })
    } finally {
      unregister()
    }
  })

  it('resolves authority only from event.context.user.id', async () => {
    const request = event()
    request.headers['x-god-mode-user'] = '33333333-3333-4333-8333-333333333333'
    request.context.godMode = { active: true, actorUserId: '44444444-4444-4444-8444-444444444444' }

    await handleGodModeRequest(request, dependencies)

    expect(resolveGodModeAuthority).toHaveBeenCalledWith(request, OWNER_ID)
  })
})
