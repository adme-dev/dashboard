import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: unknown) => Record<string, unknown>
  readBody: (event: unknown) => Promise<unknown>
  getRouterParam: (event: unknown, key: string) => string | undefined
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => (event as { query?: Record<string, unknown> }).query ?? {}
testGlobal.readBody = async event => (event as { body?: unknown }).body
testGlobal.getRouterParam = (event, key) => (event as { params?: Record<string, string> }).params?.[key]
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mockRequireScope = vi.fn()
const mockRequireClientAccess = vi.fn()
const mockRequireRole = vi.fn()
const mockListDomains = vi.fn()
const mockCreateDomain = vi.fn()
const mockUpdateDomain = vi.fn()
const mockAssertPublicOrigin = vi.fn()

vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  requireTrackingAudienceScope: (...args: unknown[]) => mockRequireScope(...args),
  requireClientTrackingAccess: (...args: unknown[]) => mockRequireClientAccess(...args),
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/repository', () => ({
  listSiteIntelligenceDomains: (...args: unknown[]) => mockListDomains(...args),
  createSiteIntelligenceDomain: (...args: unknown[]) => mockCreateDomain(...args),
  updateSiteIntelligenceDomain: (...args: unknown[]) => mockUpdateDomain(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/urlPolicy', () => ({
  assertPublicSiteOrigin: (...args: unknown[]) => mockAssertPublicOrigin(...args)
}))

const { default: listHandler } = await import(
  '../../../../server/api/agency/site-intelligence/domains/index.get'
)
const { default: createHandler } = await import(
  '../../../../server/api/agency/site-intelligence/domains/index.post'
)
const { default: updateHandler } = await import(
  '../../../../server/api/agency/site-intelligence/domains/[id].put'
)

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const DOMAIN_A = '22222222-2222-4222-8222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function event(input: {
  query?: Record<string, unknown>
  body?: unknown
  params?: Record<string, string>
} = {}) {
  return input as Parameters<typeof listHandler>[0]
}

beforeEach(() => {
  mockRequireScope.mockReset().mockResolvedValue({
    user: { id: USER_A, role: 'owner' },
    accessibleClientIds: null,
    clientIds: null
  })
  mockRequireClientAccess.mockReset().mockResolvedValue({ id: USER_A, role: 'owner' })
  mockRequireRole.mockReset().mockResolvedValue({ id: USER_A, role: 'owner' })
  mockListDomains.mockReset().mockResolvedValue([])
  mockCreateDomain.mockReset().mockResolvedValue({ id: DOMAIN_A, clientId: CLIENT_A })
  mockUpdateDomain.mockReset().mockResolvedValue({ id: DOMAIN_A, clientId: CLIENT_A })
  mockAssertPublicOrigin.mockReset().mockResolvedValue('https://competitor.example.com')
})

const competitorBody = {
  clientId: CLIENT_A,
  lane: 'competitor',
  name: 'Competitor Dealer',
  origin: 'https://Competitor.Example.com/offers',
  justification: 'Monitor approved public automotive offers.'
}

describe('site intelligence domain routes', () => {
  it('lists only the resolved accessible client scope', async () => {
    mockRequireScope.mockResolvedValue({
      user: { id: USER_A, role: 'media_buyer' },
      accessibleClientIds: [CLIENT_A],
      clientIds: [CLIENT_A]
    })
    mockListDomains.mockResolvedValue([{ id: DOMAIN_A }])

    await expect(listHandler(event({ query: { lane: 'competitor' } })))
      .resolves.toEqual({ domains: [{ id: DOMAIN_A }] })
    expect(mockListDomains).toHaveBeenCalledWith([CLIENT_A], {
      clientId: undefined,
      lane: 'competitor',
      status: undefined
    })
  })

  it('preserves management-wide scope without inventing a client filter', async () => {
    await listHandler(event())

    expect(mockListDomains).toHaveBeenCalledWith(null, {
      clientId: undefined,
      lane: undefined,
      status: undefined
    })
  })

  it('applies conservative competitor defaults before persistence', async () => {
    await createHandler(event({ body: competitorBody }))

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_A)
    expect(mockAssertPublicOrigin).toHaveBeenCalledWith(competitorBody.origin)
    expect(mockCreateDomain).toHaveBeenCalledWith(
      { id: USER_A, role: 'owner' },
      expect.objectContaining({
        clientId: CLIENT_A,
        origin: 'https://competitor.example.com',
        discoveryMode: 'sitemaps',
        pageLimit: 100,
        depth: 2,
        crawlPurposes: ['search'],
        aiInputAllowed: false,
        retentionDays: 30
      })
    )
  })

  it('rejects mutation before persistence when the operator is not an administrator', async () => {
    mockRequireRole.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(createHandler(event({ body: competitorBody }))).rejects.toMatchObject({ statusCode: 403 })
    expect(mockRequireClientAccess).not.toHaveBeenCalled()
    expect(mockCreateDomain).not.toHaveBeenCalled()
  })

  it('returns a stable conflict for a duplicate client origin and lane', async () => {
    mockCreateDomain.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }))

    await expect(createHandler(event({ body: competitorBody }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'This domain is already monitored for the selected client and lane'
    })
  })

  it('rejects a non-public origin before persistence', async () => {
    mockAssertPublicOrigin.mockRejectedValue(new Error('Private address blocked'))

    await expect(createHandler(event({ body: competitorBody }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Public HTTP(S) origin required'
    })
    expect(mockCreateDomain).not.toHaveBeenCalled()
  })

  it('updates only after route, client access, and public-origin validation', async () => {
    await updateHandler(event({
      params: { id: DOMAIN_A },
      body: { ...competitorBody, name: 'Updated competitor' }
    }) as Parameters<typeof updateHandler>[0])

    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_A)
    expect(mockUpdateDomain).toHaveBeenCalledWith(
      { id: USER_A, role: 'owner' },
      DOMAIN_A,
      expect.objectContaining({ name: 'Updated competitor', origin: 'https://competitor.example.com' })
    )
  })

  it('does not return audit metadata from a mutation response', async () => {
    mockCreateDomain.mockResolvedValue({
      id: DOMAIN_A,
      clientId: CLIENT_A,
      origin: 'https://competitor.example.com'
    })

    const response = await createHandler(event({ body: competitorBody }))
    expect(response).toEqual({
      domain: {
        id: DOMAIN_A,
        clientId: CLIENT_A,
        origin: 'https://competitor.example.com'
      }
    })
    expect(JSON.stringify(response)).not.toMatch(/audit|metadata|actor/i)
  })
})
