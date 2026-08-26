import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
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

  it('does not activate God mode for an ordinary active-owner read request', async () => {
    const request = event()

    await handleGodModeRequest(request)

    expect(resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
    expect(getGodModeRouteAuditState(request)).toBeNull()
  })

  it('does not make ordinary UI availability depend on the God mode audit store', async () => {
    appendGodModeAuditEvent.mockRejectedValue(new Error('database unavailable'))

    await expect(handleGodModeRequest(event())).resolves.toBeUndefined()
  })

  it.each([
    '/api/ai/action-plan',
    '/api/agency/ai/chat/conversations'
  ])('does not classify the ordinary active-owner UI POST %s as a God mode mutation', async (path) => {
    const request = event(path, 'POST')

    await expect(handleGodModeRequest(request)).resolves.toBeUndefined()
    expect(resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
    expect(getGodModeRouteAuditState(request)).toBeNull()
  })

  it('does not eagerly prepare even a registered family before code requests a bypass', async () => {
    const prepare = vi.fn(async () => ({
      strategy: 'transaction-bound' as const,
      prepared: true as const,
      persistTerminal: vi.fn()
    }))
    const unregister = registerGodModeMutationFamily({
      family: 'client-portal-access-test',
      method: 'POST',
      matchesPath: path => path === '/api/agency/client-portal/access',
      prepare
    })
    try {
      await expect(handleGodModeRequest(
        event('/api/agency/client-portal/access', 'POST', {
          'idempotency-key': 'portal-access-11111111-1111-4111-8111-111111111111'
        })
      )).resolves.toBeUndefined()
      expect(prepare).not.toHaveBeenCalled()
    } finally {
      unregister()
    }
  })

  it.each([
    '/api/public/contact',
    '/api/health',
    '/api/internal/mcp/call',
    '/api/mcp/authorize',
    '/_nuxt/app.js',
    '/features'
  ])('excludes %s before resolving authority', async (path) => {
    await handleGodModeRequest(event(path))
    expect(resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })

  it('uses canonical pathname so query strings do not defeat an exact exclusion', async () => {
    await handleGodModeRequest(event('/api/health?probe=1'))
    expect(resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })
})
