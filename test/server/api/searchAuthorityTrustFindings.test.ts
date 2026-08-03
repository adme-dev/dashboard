import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  query: { clientId: '11111111-1111-4111-8111-111111111111' } as Record<string, unknown>,
  body: { clientId: '11111111-1111-4111-8111-111111111111', pageLimit: 1 } as Record<string, unknown>,
  requireAccess: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  collect: vi.fn()
}))

vi.mock('h3', () => ({ getQuery: () => mocks.query }))
vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: mocks.queryRows,
  execute: mocks.execute
}))
vi.mock('~~/server/utils/searchAuthority/performanceEvidence', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/searchAuthority/performanceEvidence')>(),
  collectPageSpeedEvidence: mocks.collect
}))

vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => mocks.body)
vi.stubGlobal('useRuntimeConfig', () => ({ pagespeedApiKey: 'not-returned' }))

describe('Search Authority trust APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = { clientId: CLIENT_ID }
    mocks.body = { clientId: CLIENT_ID, pageLimit: 1 }
    mocks.requireAccess.mockResolvedValue({ id: 'owner-1', role: 'owner' })
  })

  it('reads findings only after tenant access and returns bounded mapped evidence', async () => {
    mocks.queryRows.mockResolvedValueOnce([{
      id: 'finding-1',
      page_id: 'page-1',
      page_url: 'https://dealer.example.com/vehicles/h6',
      check_key: 'canonical.missing',
      severity: 'medium',
      owner: 'dealer_origin',
      lifecycle_status: 'open',
      title: 'Canonical URL is missing',
      summary: 'The rendered HTML does not declare a canonical URL.',
      evidence: { pageUrl: 'https://dealer.example.com/vehicles/h6' },
      recurrence_count: '2',
      task_id: null,
      first_seen_at: '2026-08-02T00:00:00.000Z',
      last_seen_at: '2026-08-03T00:00:00.000Z',
      performance_evidence: null
    }]).mockResolvedValueOnce([])
    const handler = (await import(
      '~~/server/api/agency/search-authority/trust/findings.get'
    )).default

    const response = await handler({ context: {} } as never)

    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(mocks.queryRows.mock.calls[0]?.[1]).toEqual([CLIENT_ID, null, 50])
    expect(response.findings[0]).toMatchObject({
      id: 'finding-1',
      checkKey: 'canonical.missing',
      recurrenceCount: 2,
      performance: null
    })
    expect(JSON.stringify(response)).not.toMatch(/api.?key|provider payload/i)
  })

  it('refreshes only selected owned pages and stores normalized provider evidence', async () => {
    mocks.queryRows.mockResolvedValueOnce([{
      page_id: 'page-1',
      domain_id: 'domain-1',
      canonical_url: 'https://dealer.example.com/vehicles/h6',
      origin: 'https://dealer.example.com'
    }])
    mocks.collect.mockResolvedValueOnce({
      status: 'unavailable',
      reasonCode: 'provider_key_missing',
      providerAt: null,
      providerVersion: null
    })
    mocks.execute.mockResolvedValueOnce(1)
    const handler = (await import(
      '~~/server/api/agency/search-authority/trust/refresh.post'
    )).default

    const response = await handler({ context: {} } as never)

    expect(String(mocks.queryRows.mock.calls[0]?.[0])).toContain(`domain.lane = 'owned'`)
    expect(mocks.collect).toHaveBeenCalledWith({
      url: 'https://dealer.example.com/vehicles/h6',
      ownedOrigin: 'https://dealer.example.com',
      apiKey: 'not-returned'
    })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(response).toMatchObject({ requested: 1, stored: 1, unavailable: 1 })
    expect(JSON.stringify(response)).not.toContain('not-returned')
  })
})
