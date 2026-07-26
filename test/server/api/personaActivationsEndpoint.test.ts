import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'

let mockBody: Record<string, unknown> = {}
const mockRequirePersonaAdminAccess = vi.fn()
const mockCreatePersonaActivationRequest = vi.fn()
const mockRequireClientEntitlement = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody: () => mockBody,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

vi.mock('~~/server/utils/persona/access', () => ({
  requirePersonaAdminAccess: (...args: unknown[]) => mockRequirePersonaAdminAccess(...args)
}))

vi.mock('~~/server/utils/persona/activation', () => ({
  createPersonaActivationRequest: (...args: unknown[]) => mockCreatePersonaActivationRequest(...args)
}))

vi.mock('~~/server/utils/billing/entitlements', () => ({
  requireClientEntitlement: (...args: unknown[]) => mockRequireClientEntitlement(...args)
}))

describe('POST /agency/analytics/personas/activations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePersonaAdminAccess.mockResolvedValue({ id: ACTOR_ID })
    mockRequireClientEntitlement.mockResolvedValue(undefined)
    mockCreatePersonaActivationRequest.mockResolvedValue({
      id: 'request-1',
      status: 'pending_privacy',
      estimatedSize: 1500,
      minimumSize: 1000,
      blockedReason: null
    })
  })

  it('accepts a tierKey filter instead of rejecting it as an unrecognized key', async () => {
    mockBody = {
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Hot tier audience',
      filters: { tierKey: 'hot' },
      expiresAt: '2026-08-01T00:00:00.000Z'
    }
    const handler = (await import(
      '~~/server/api/agency/analytics/personas/activations.post'
    )).default

    await handler({ context: {} } as never)

    expect(mockCreatePersonaActivationRequest).toHaveBeenCalledWith(expect.objectContaining({
      filters: { tierKey: 'hot' }
    }))
  })

  it('still rejects an invalid tierKey value', async () => {
    mockBody = {
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Bogus tier audience',
      filters: { tierKey: 'blazing' },
      expiresAt: '2026-08-01T00:00:00.000Z'
    }
    const handler = (await import(
      '~~/server/api/agency/analytics/personas/activations.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreatePersonaActivationRequest).not.toHaveBeenCalled()
  })

  it('still accepts a request with no tierKey filter (existing behavior)', async () => {
    mockBody = {
      clientId: CLIENT_ID,
      provider: 'google_ads',
      name: 'All personas',
      filters: { platform: 'google' },
      expiresAt: '2026-08-01T00:00:00.000Z'
    }
    const handler = (await import(
      '~~/server/api/agency/analytics/personas/activations.post'
    )).default

    await handler({ context: {} } as never)

    expect(mockCreatePersonaActivationRequest).toHaveBeenCalledWith(expect.objectContaining({
      filters: { platform: 'google' }
    }))
  })
})
