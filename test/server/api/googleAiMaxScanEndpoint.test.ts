import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONS } from '~~/server/utils/permissions'

const mockRequireRole = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockLoadContext = vi.fn()
const mockClaimRun = vi.fn()
const mockGetActiveRun = vi.fn()
const mockGetRun = vi.fn()
const mockRunScan = vi.fn()
const mockRunAfterResponse = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: any[]) => mockRequireRole(...args),
}))
vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: any[]) => mockGetSelectedTenant(...args),
}))
vi.mock('~~/server/utils/googleAiMaxConnections', () => ({
  loadGoogleAiMaxScanContext: (...args: any[]) => mockLoadContext(...args),
}))
vi.mock('~~/server/utils/googleAiMaxRepository', () => ({
  claimGoogleAiMaxScanRun: (...args: any[]) => mockClaimRun(...args),
  getActiveGoogleAiMaxScanRun: (...args: any[]) => mockGetActiveRun(...args),
  getGoogleAiMaxScanRun: (...args: any[]) => mockGetRun(...args),
}))
vi.mock('~~/server/utils/googleAiMaxScanner', () => ({
  runGoogleAiMaxPortfolioScan: (...args: any[]) => mockRunScan(...args),
}))
vi.mock('~~/server/utils/asyncBackground', () => ({
  runAfterResponse: (...args: any[]) => mockRunAfterResponse(...args),
}))

;(globalThis as any).eventHandler = (handler: any) => handler
;(globalThis as any).readBody = (event: any) => Promise.resolve(event.body ?? {})
;(globalThis as any).getRouterParam = (event: any, name: string) => event.params?.[name]
;(globalThis as any).createError = (input: any) => Object.assign(
  new Error(input.statusMessage),
  input,
)

const { default: scanHandler } = await import(
  '../../../../server/api/agency/social/google/ai-max/scan.post'
)
const { default: statusHandler } = await import(
  '../../../../server/api/agency/social/google/ai-max/scans/[id].get'
)

const CONNECTION_ID = '00000000-0000-4000-8000-000000000001'
const RUN_ID = '00000000-0000-4000-8000-000000000002'

describe('POST /api/agency/social/google/ai-max/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-a')
    mockLoadContext.mockResolvedValue({
      developerToken: 'developer-token',
      accounts: [{ connectionId: CONNECTION_ID, customerId: '123', accessToken: 'token' }],
    })
    mockClaimRun.mockResolvedValue({ id: 'run-1', status: 'queued' })
    mockGetActiveRun.mockResolvedValue(null)
    mockRunScan.mockResolvedValue({
      accepted: true,
      run: { id: 'run-1', status: 'completed' },
      failures: [],
    })
  })

  it('requires MEDIA_BUYING permission', async () => {
    mockRequireRole.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(scanHandler({ body: {} } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), PERMISSIONS.MEDIA_BUYING)
  })

  it('fails closed when no tenant is selected', async () => {
    mockGetSelectedTenant.mockResolvedValue(undefined)

    await expect(scanHandler({ body: {} } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'No Xero organisation selected',
    })
    expect(mockLoadContext).not.toHaveBeenCalled()
  })

  it('rejects an active Google connection outside the selected scope', async () => {
    mockLoadContext.mockResolvedValue({ developerToken: 'developer-token', accounts: [] })

    await expect(scanHandler({ body: { connectionId: CONNECTION_ID } } as any)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('claims a run and schedules the provider work after the response', async () => {
    const response = await scanHandler({ body: { connectionId: CONNECTION_ID } } as any)

    expect(response).toEqual({ runId: 'run-1', status: 'queued', deduplicated: false })
    expect(mockClaimRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a',
      requestedBy: 'user-1',
      totalConnections: 1,
    }))
    expect(mockRunScan).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a',
      claimedRun: { id: 'run-1', status: 'queued' },
    }))
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1)
  })

  it('returns the active run without starting duplicate provider work', async () => {
    mockClaimRun.mockResolvedValue(null)
    mockGetActiveRun.mockResolvedValue({ id: 'run-existing', status: 'running' })

    const response = await scanHandler({ body: {} } as any)

    expect(response).toEqual({
      runId: 'run-existing',
      status: 'running',
      deduplicated: true,
    })
    expect(mockRunScan).not.toHaveBeenCalled()
  })
})

describe('GET /api/agency/social/google/ai-max/scans/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-a')
  })

  it('returns tenant-scoped progress and safe failures', async () => {
    mockGetRun.mockResolvedValue({
      id: RUN_ID,
      status: 'partial',
      trigger: 'manual',
      processedConnections: 1,
      totalConnections: 2,
      totalCampaigns: 4,
      affectedCampaigns: 2,
      unknownCampaigns: 1,
      failures: [{ connectionId: CONNECTION_ID, error: 'access denied' }],
      startedAt: '2026-08-06T00:00:00.000Z',
      finishedAt: '2026-08-06T00:01:00.000Z',
    })

    const response = await statusHandler({ params: { id: RUN_ID } } as any)

    expect(response.status).toBe('partial')
    expect(response.failures).toEqual([{ connectionId: CONNECTION_ID, error: 'access denied' }])
    expect(mockGetRun).toHaveBeenCalledWith('tenant-a', RUN_ID)
  })

  it('returns 404 for a run outside the selected tenant', async () => {
    mockGetRun.mockResolvedValue(null)

    await expect(statusHandler({ params: { id: RUN_ID } } as any)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
