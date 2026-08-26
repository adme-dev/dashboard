import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError, type H3Event } from 'h3'
import {
  canBypassApplicationControl,
  getGodModeRouteAuditState,
  isApplicationCapabilityEnabled,
  recordGodModeBypassedControls,
  registerGodModeMutationFamily
} from '../../../server/utils/godMode/featureGate'

const { appendGodModeAuditEvent, resolveGodModeAuthority } = vi.hoisted(() => ({
  appendGodModeAuditEvent: vi.fn(),
  resolveGodModeAuthority: vi.fn()
}))

vi.mock('../../../server/utils/godMode/audit', () => ({
  appendGodModeAuditEvent
}))
vi.mock('../../../server/utils/godMode/authority', () => ({
  resolveGodModeAuthority,
  isActiveGodModeAuthority: (authority: unknown, actorUserId: string) => {
    const candidate = authority as Record<string, unknown> | null
    return candidate?.active === true
      && candidate.actorUserId === actorUserId
      && candidate.reason === 'active_owner'
      && candidate.emergencyDisabled === false
  }
}))

const OWNER_ID = '11111111-1111-4111-8111-111111111111'

function event(path: string, method = 'POST') {
  return {
    method,
    path,
    context: { user: { id: OWNER_ID } },
    node: {
      req: {
        originalUrl: path,
        headers: {
          host: 'app.xeroflow.test',
          authorization: 'Bearer owner-session-secret'
        },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
}

describe('God mode activation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appendGodModeAuditEvent.mockResolvedValue(undefined)
    resolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: OWNER_ID,
      reason: 'active_owner',
      emergencyDisabled: false
    })
  })

  it('activates and coordinates a mutation only when code requests a bypass', async () => {
    const request = event('/api/agency/example')
    const prepare = vi.fn(async () => ({
      strategy: 'transaction-bound' as const,
      prepared: true as const,
      persistTerminal: vi.fn()
    }))
    const unregister = registerGodModeMutationFamily({
      family: 'activation-boundary-example',
      method: 'POST',
      matchesPath: path => path === '/api/agency/example',
      prepare
    })

    try {
      expect(getGodModeRouteAuditState(request)).toBeNull()
      await expect(canBypassApplicationControl(request, 'permission')).resolves.toBe(true)
      expect(appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        actorUserId: OWNER_ID,
        routeOrTool: 'POST /api/agency/example',
        phase: 'attempt'
      }))
      expect(appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        routeOrTool: 'POST /api/agency/example',
        phase: 'bypass',
        bypassedControls: ['permission']
      }))
      expect(prepare).toHaveBeenCalledOnce()
      expect(getGodModeRouteAuditState(request)?.mutationCoordination?.prepared).toBe(true)
    } finally {
      unregister()
    }
  })

  it('fails closed when an actual mutation bypass has no registered coordinator', async () => {
    await expect(canBypassApplicationControl(
      event('/api/agency/uncoordinated'),
      'permission'
    )).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'God mode mutation coordination required'
    })
  })

  it('preserves a trusted coordinator precondition error', async () => {
    const unregister = registerGodModeMutationFamily({
      family: 'activation-boundary-precondition',
      method: 'POST',
      matchesPath: path => path === '/api/agency/precondition',
      prepare: async () => {
        throw createError({ statusCode: 428, statusMessage: 'Stable Idempotency-Key required' })
      }
    })

    try {
      await expect(canBypassApplicationControl(
        event('/api/agency/precondition'),
        'permission'
      )).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: 'Stable Idempotency-Key required'
      })
    } finally {
      unregister()
    }
  })

  it('does not expose an arbitrary status-shaped coordinator error', async () => {
    const unregister = registerGodModeMutationFamily({
      family: 'activation-boundary-untrusted-error',
      method: 'POST',
      matchesPath: path => path === '/api/agency/untrusted-error',
      prepare: async () => {
        throw { statusCode: 409, statusMessage: 'internal conflict detail' }
      }
    })

    try {
      await expect(canBypassApplicationControl(
        event('/api/agency/untrusted-error'),
        'permission'
      )).rejects.toMatchObject({
        statusCode: 503,
        statusMessage: 'God mode mutation coordination unavailable'
      })
    } finally {
      unregister()
    }
  })

  it('does not activate an unreviewed read route', async () => {
    const request = event('/api/agency/clients', 'GET')

    await expect(canBypassApplicationControl(request, 'permission')).resolves.toBe(false)
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
    expect(getGodModeRouteAuditState(request)).toBeNull()
  })

  it('does not activate for an actor without current owner authority', async () => {
    const request = event('/api/crm/ai/status', 'GET')
    resolveGodModeAuthority.mockResolvedValue({
      active: false,
      actorUserId: OWNER_ID,
      reason: 'emergency_disabled',
      emergencyDisabled: true
    })

    await expect(canBypassApplicationControl(request, 'feature_flag')).resolves.toBe(false)
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
    expect(getGodModeRouteAuditState(request)).toBeNull()
  })

  it('lazily activates a reviewed read route when its normal gate is closed', async () => {
    const request = event('/api/crm/ai/status', 'GET')

    await expect(isApplicationCapabilityEnabled(request, false)).resolves.toBe(true)
    expect(appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      routeOrTool: 'GET /api/crm/ai/status',
      phase: 'attempt'
    }))
    expect(appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      routeOrTool: 'GET /api/crm/ai/status',
      phase: 'bypass',
      bypassedControls: ['feature_flag']
    }))
    expect(getGodModeRouteAuditState(request)?.bypassedControls).toContain('feature_flag')
  })

  it('does no God mode work when the normal capability is already enabled', async () => {
    const request = event('/api/crm/ai/status', 'GET')

    await expect(isApplicationCapabilityEnabled(request, true)).resolves.toBe(true)
    expect(resolveGodModeAuthority).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })

  it('lazily activates before recording a server-classified bypass', async () => {
    const request = event('/api/agency/example')
    const unregister = registerGodModeMutationFamily({
      family: 'activation-boundary-recording',
      method: 'POST',
      matchesPath: path => path === '/api/agency/example',
      prepare: async () => ({
        strategy: 'transaction-bound',
        prepared: true,
        persistTerminal: vi.fn()
      })
    })

    try {
      await recordGodModeBypassedControls(request, ['rate_limit'])
      expect(appendGodModeAuditEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ phase: 'attempt' }))
      expect(appendGodModeAuditEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
        phase: 'bypass',
        bypassedControls: ['rate_limit']
      }))
    } finally {
      unregister()
    }
  })
})
