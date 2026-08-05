import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockListExport = vi.fn()
const mockSetHeader = vi.fn()
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
    listGoogleAiMaxReadinessForExport: (...args: any[]) => mockListExport(...args),
  }
})

;(globalThis as any).eventHandler = (handler: any) => handler
;(globalThis as any).getQuery = () => query
;(globalThis as any).setHeader = (...args: any[]) => mockSetHeader(...args)
;(globalThis as any).createError = (input: any) => Object.assign(
  new Error(input.statusMessage),
  input,
)

const { default: handler } = await import(
  '../../../../server/api/agency/social/google/ai-max/export.csv.get'
)
const { GoogleAiMaxExportLimitError } = await import(
  '~~/server/utils/googleAiMaxReadiness'
)

describe('GET /api/agency/social/google/ai-max/export.csv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query = { status: 'needs_review', search: 'Generic' }
    mockRequireRole.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-a')
    mockListExport.mockResolvedValue([{
      client: { id: 'client-a', name: '=HYPERLINK("bad")' },
      accountName: 'Account, A',
      campaignName: '+SUM(A1:A2)',
      campaignStatus: 'ENABLED',
      readinessStatus: 'needs_review',
      migrationReason: 'aca',
      aiMaxEnabled: true,
      effectiveSettings: {
        searchTermMatching: 'partially_disabled',
        textCustomisation: 'enabled',
        finalUrlExpansion: 'disabled',
      },
      risks: ['PARTIAL_SEARCH_MATCHING'],
      freshness: 'fresh',
      lastObservedAt: '2026-08-06T00:00:00.000Z',
      owner: null,
      deepLink: 'https://ads.google.com/aw/campaigns',
    }])
  })

  it('exports the exact filtered set with formula-safe cells and UTF-8 headers', async () => {
    const body = await handler({} as any)

    expect(mockListExport).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      filters: expect.objectContaining({ status: 'needs_review', search: 'Generic' }),
    })
    expect(body).toContain("'=HYPERLINK")
    expect(body).toContain("'+SUM(A1:A2)")
    expect(body).toContain('"Account, A"')
    expect(mockSetHeader).toHaveBeenCalledWith(
      expect.anything(),
      'Content-Type',
      'text/csv; charset=utf-8',
    )
    expect(mockSetHeader).toHaveBeenCalledWith(
      expect.anything(),
      'Content-Disposition',
      expect.stringMatching(/google-ai-max-readiness-\d{4}-\d{2}-\d{2}\.csv/),
    )
  })

  it('rejects invalid filters before querying export rows', async () => {
    query = { pageSize: '1000' }

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockListExport).not.toHaveBeenCalled()
  })

  it('requires narrower filters when the bounded export is too large', async () => {
    mockListExport.mockRejectedValue(new GoogleAiMaxExportLimitError())

    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 413 })
  })
})
