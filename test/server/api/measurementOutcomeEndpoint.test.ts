import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const mockRequireClientAccess = vi.fn()
const mockList = vi.fn()
const mockCreate = vi.fn()
const mockRuntime = vi.fn(() => ({ list: mockList, create: mockCreate }))
let mockBody: Record<string, unknown> = {}
let mockQuery: Record<string, string> = {}

vi.mock('~~/server/utils/measurement/access', () => ({
  requireMeasurementClientAccess: (...args: unknown[]) => mockRequireClientAccess(...args)
}))

vi.mock('~~/server/utils/measurement/runtime', () => ({
  createMeasurementOutcomeEndpointRuntime: (...args: unknown[]) => mockRuntime(...args)
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

describe('agency Measurement outcome endpoint APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {}
    mockQuery = {}
    mockRequireClientAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    mockList.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }
    })
    mockCreate.mockResolvedValue({
      endpoint: { id: '44444444-4444-4444-8444-444444444444', status: 'disabled' },
      profileConfigVersion: 5,
      warnings: []
    })
  })

  it('lists only after scoped access and forwards bounded pagination input', async () => {
    mockQuery = { page: '2', pageSize: '10' }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/outcome-endpoints/index.get'
    )).default

    await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'view')
    expect(mockList).toHaveBeenCalledWith({ clientId: CLIENT_ID, page: '2', pageSize: '10' })
  })

  it('derives client and actor while excluding spoofed endpoint identity and live state', async () => {
    mockBody = {
      clientId: '99999999-9999-4999-8999-999999999999',
      expectedProfileVersion: 4,
      actor: { type: 'system', id: 'spoofed' },
      endpointKey: 'client-selected-key',
      status: 'live',
      reason: 'Prepare external CRM outcomes',
      endpoint: {
        label: 'Dealer CRM',
        sourceSystem: 'dealer_crm',
        currentSecretRef: 'cloudflare/measurement/outcomes/dealer-crm-v1',
        replayWindowSeconds: 300,
        rateLimitPerMinute: 60
      }
    }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/outcome-endpoints/index.post'
    )).default

    await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'configure')
    expect(mockCreate).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      expectedProfileVersion: 4,
      actor: { type: 'team_member', id: ACTOR_ID },
      reason: 'Prepare external CRM outcomes',
      endpoint: mockBody.endpoint
    })
  })
})
