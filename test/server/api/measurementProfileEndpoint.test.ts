import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MeasurementError } from '../../../server/utils/measurement/errors'

const mockRequireClientAccess = vi.fn()
const mockGet = vi.fn()
const mockUpdate = vi.fn()
const mockRuntime = vi.fn((..._args: unknown[]) => ({ get: mockGet, update: mockUpdate }))
let mockBody: Record<string, unknown> = {}

vi.mock('~~/server/utils/measurement/access', () => ({
  requireMeasurementClientAccess: (...args: unknown[]) => mockRequireClientAccess(...args)
}))

vi.mock('~~/server/utils/measurement/runtime', () => ({
  createMeasurementProfileRuntime: (...args: unknown[]) => mockRuntime(...args)
}))

vi.mock('~~/server/utils/measurement/configurationGodMode', () => ({
  executeGodModeMeasurementProfileUpdate: (
    _event: unknown,
    mutate: (db: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>
  ) => mutate({ query: vi.fn() })
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => '11111111-1111-4111-8111-111111111111',
  readBody: () => mockBody,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

describe('agency Measurement profile endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {}
    mockRequireClientAccess.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      role: 'media_buyer'
    })
    mockGet.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      clientId: '11111111-1111-4111-8111-111111111111',
      enabled: false,
      environment: 'test',
      configVersion: 1
    })
    mockUpdate.mockResolvedValue({
      profile: { configVersion: 2, enabled: false, environment: 'test' },
      warnings: []
    })
  })

  it('reads only after the caller passes client-scoped view access', async () => {
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId].get'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      '11111111-1111-4111-8111-111111111111',
      'view'
    )
    expect(mockGet).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(result).toEqual({ profile: expect.objectContaining({ configVersion: 1 }) })
  })

  it('derives the audit actor from auth and ignores an actor supplied in the body', async () => {
    mockBody = {
      expectedVersion: 1,
      reason: 'Prepare a test-only hostname',
      actor: { type: 'system', id: 'spoofed-actor' },
      patch: {
        collectionTier: 'first_party_cname',
        firstPartyHostname: 'track.example.com'
      }
    }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/profile.put'
    )).default

    await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      '11111111-1111-4111-8111-111111111111',
      'configure'
    )
    expect(mockUpdate).toHaveBeenCalledWith({
      clientId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 1,
      reason: 'Prepare a test-only hostname',
      actor: {
        type: 'team_member',
        id: '33333333-3333-4333-8333-333333333333'
      },
      patch: {
        collectionTier: 'first_party_cname',
        firstPartyHostname: 'track.example.com'
      }
    })
  })

  it('does not touch the service when client access is denied', async () => {
    mockRequireClientAccess.mockRejectedValue(Object.assign(new Error('Not found'), {
      statusCode: 404,
      statusMessage: 'Measurement profile not found'
    }))
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId].get'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('maps service conflicts to the stable redacted HTTP error', async () => {
    mockBody = {
      expectedVersion: 1,
      reason: 'Stale update',
      patch: { hostnameStatus: 'active' }
    }
    mockUpdate.mockRejectedValue(new MeasurementError(
      'MEASUREMENT_VERSION_CONFLICT',
      409,
      'Measurement profile changed; refresh before updating'
    ))
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/profile.put'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Measurement profile changed; refresh before updating'
    })
  })
})
