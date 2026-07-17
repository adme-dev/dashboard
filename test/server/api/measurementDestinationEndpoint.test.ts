import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MeasurementError } from '../../../server/utils/measurement/errors'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const mockRequireClientAccess = vi.fn()
const mockList = vi.fn()
const mockCreate = vi.fn()
const mockRuntime = vi.fn((..._args: unknown[]) => ({ list: mockList, create: mockCreate }))
let mockBody: Record<string, unknown> = {}
let mockQuery: Record<string, string> = {}

vi.mock('~~/server/utils/measurement/access', () => ({
  requireMeasurementClientAccess: (...args: unknown[]) => mockRequireClientAccess(...args)
}))

vi.mock('~~/server/utils/measurement/runtime', () => ({
  createMeasurementDestinationRuntime: (...args: unknown[]) => mockRuntime(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => CLIENT_ID,
  getQuery: () => mockQuery,
  readBody: () => mockBody,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

describe('agency Measurement destination endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {}
    mockQuery = {}
    mockRequireClientAccess.mockResolvedValue({ id: ACTOR_ID, role: 'media_buyer' })
    mockList.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }
    })
    mockCreate.mockResolvedValue({
      destination: { id: '55555555-5555-4555-8555-555555555555', configVersion: 2 },
      profileConfigVersion: 2,
      warnings: []
    })
  })

  it('lists destinations only after scoped view access and forwards bounded query input', async () => {
    mockQuery = { page: '2', pageSize: '10', platform: 'meta' }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/destinations/index.get'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'view')
    expect(mockList).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      page: '2',
      pageSize: '10',
      platform: 'meta'
    })
    expect(result).toEqual(expect.objectContaining({ items: [] }))
  })

  it('derives client and audit actor while ignoring spoofed body values', async () => {
    mockBody = {
      clientId: '99999999-9999-4999-8999-999999999999',
      expectedProfileVersion: 1,
      reason: 'Configure Meta CRM delivery',
      actor: { type: 'system', id: 'spoofed' },
      destination: {
        platform: 'meta',
        externalDestinationId: '573284833843027',
        capabilities: [{
          mode: 'meta_crm_capi',
          status: 'configured',
          managementOrigin: 'zero',
          canZeroMutate: true
        }]
      }
    }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/destinations/index.post'
    )).default

    await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'configure')
    expect(mockCreate).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      expectedProfileVersion: 1,
      reason: 'Configure Meta CRM delivery',
      actor: { type: 'team_member', id: ACTOR_ID },
      destination: mockBody.destination
    })
  })

  it('does not construct or call the service when tenant access is denied', async () => {
    mockRequireClientAccess.mockRejectedValue(Object.assign(new Error('Not found'), {
      statusCode: 404,
      statusMessage: 'Measurement profile not found'
    }))
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/destinations/index.get'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockRuntime).not.toHaveBeenCalled()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('maps duplicate configuration to the stable redacted HTTP conflict', async () => {
    mockBody = {
      expectedProfileVersion: 1,
      reason: 'Duplicate setup',
      destination: {
        platform: 'meta',
        externalDestinationId: '573284833843027',
        capabilities: [{
          mode: 'meta_crm_capi',
          managementOrigin: 'zero',
          canZeroMutate: true
        }]
      }
    }
    mockCreate.mockRejectedValue(new MeasurementError(
      'MEASUREMENT_DUPLICATE',
      409,
      'Measurement destination already exists'
    ))
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/destinations/index.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Measurement destination already exists',
      data: {
        error: {
          code: 'MEASUREMENT_DUPLICATE',
          message: 'Measurement destination already exists'
        }
      }
    })
  })
})
