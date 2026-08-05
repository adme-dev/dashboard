import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONS } from '~~/server/utils/permissions'

const mockRequireRole = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockListReadiness = vi.fn()
const mockGetDetail = vi.fn()
let query: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: any[]) => mockRequireRole(...args),
}))
vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: any[]) => mockGetSelectedTenant(...args),
}))
vi.mock('~~/server/utils/googleAiMaxReadiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/googleAiMaxReadiness')>()
  return {
    ...actual,
    listGoogleAiMaxReadiness: (...args: any[]) => mockListReadiness(...args),
    getGoogleAiMaxReadinessDetail: (...args: any[]) => mockGetDetail(...args),
  }
})

;(globalThis as any).eventHandler = (handler: any) => handler
;(globalThis as any).getQuery = () => query
;(globalThis as any).getRouterParam = (event: any, name: string) => event.params?.[name]
;(globalThis as any).createError = (input: any) => Object.assign(
  new Error(input.statusMessage),
  input,
)

const { default: listHandler } = await import(
  '../../../../server/api/agency/social/google/ai-max/readiness.get'
)
const { default: detailHandler } = await import(
  '../../../../server/api/agency/social/google/ai-max/readiness/[id].get'
)

const STATE_ID = '00000000-0000-4000-8000-000000000001'

describe('GET /api/agency/social/google/ai-max/readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query = {}
    mockRequireRole.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-a')
    mockListReadiness.mockResolvedValue({
      summary: { eligible: 0 },
      items: [],
      pagination: { page: 1, pageSize: 25, total: 0 },
      latestRun: null,
    })
  })

  it('requires media buying permission and a selected tenant', async () => {
    await listHandler({} as any)
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), PERMISSIONS.MEDIA_BUYING)

    mockGetSelectedTenant.mockResolvedValue(undefined)
    await expect(listHandler({} as any)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects invalid filters before querying readiness state', async () => {
    query = { pageSize: '1000', status: 'healthy' }

    await expect(listHandler({} as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockListReadiness).not.toHaveBeenCalled()
  })

  it('passes normalized filters and tenant scope to the repository', async () => {
    query = { page: '2', pageSize: '10', status: 'needs_review', search: ' Generic ' }

    await listHandler({} as any)

    expect(mockListReadiness).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      filters: {
        page: 2,
        pageSize: 10,
        status: 'needs_review',
        search: 'Generic',
      },
    })
  })
})

describe('GET /api/agency/social/google/ai-max/readiness/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-a')
  })

  it('returns a tenant-scoped detail record', async () => {
    mockGetDetail.mockResolvedValue({ id: STATE_ID, campaignName: 'Generic Search' })

    const result = await detailHandler({ params: { id: STATE_ID } } as any)

    expect(result.campaignName).toBe('Generic Search')
    expect(mockGetDetail).toHaveBeenCalledWith('tenant-a', STATE_ID)
  })

  it('hides cross-tenant state ids behind 404', async () => {
    mockGetDetail.mockResolvedValue(null)

    await expect(detailHandler({ params: { id: STATE_ID } } as any)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
