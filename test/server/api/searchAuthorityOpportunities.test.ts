import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OPPORTUNITY_ID = '22222222-2222-4222-8222-222222222222'
const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  body: {} as Record<string, unknown>,
  requireAccess: vi.fn(),
  queryRows: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn()
}))

vi.mock('h3', () => ({
  getQuery: () => mocks.query,
  getRouterParam: () => OPPORTUNITY_ID
}))
vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: mocks.queryRows,
  queryOne: mocks.queryOne,
  execute: mocks.execute
}))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => mocks.body)

describe('Search Authority opportunity APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = { clientId: CLIENT_ID }
    mocks.body = {}
  })

  it('lists scoped evidence with provider completeness and score reasons', async () => {
    mocks.queryOne.mockResolvedValue({ total: '1' })
    mocks.queryRows.mockResolvedValue([{
      id: OPPORTUNITY_ID,
      client_id: CLIENT_ID,
      opportunity_type: 'low_ctr',
      query_text: 'haval h6 hybrid',
      page_url: 'https://example.com/h6',
      title: 'Improve CTR',
      summary: 'Search demand is not converting to clicks.',
      score: 72,
      confidence: '0.7500',
      scoring_version: 'gsc-v1',
      reason_codes: [{ code: 'provider_data_provisional' }],
      lifecycle_status: 'new',
      evidence_start_date: '2026-07-01',
      evidence_end_date: '2026-07-28',
      task_id: null,
      data_through_date: '2026-07-30',
      provisional_from_date: '2026-07-29'
    }])
    const handler = (await import(
      '~~/server/api/agency/search-authority/opportunities/index.get'
    )).default
    const result = await handler({} as never)

    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(result.opportunities[0]).toMatchObject({
      id: OPPORTUNITY_ID,
      score: 72,
      confidence: 0.75,
      reasonCodes: [{ code: 'provider_data_provisional' }],
      provider: {
        dataThroughDate: '2026-07-30',
        provisionalFromDate: '2026-07-29',
        provisional: true
      }
    })
    expect(result.pagination).toEqual({ page: 1, pageSize: 25, total: 1 })
    expect(mocks.queryRows.mock.calls[0]?.[0]).toContain(
      `map.status IN ('active', 'restricted')`
    )
    expect(mocks.queryRows.mock.calls[0]?.[0]).toContain(
      'opportunity.id DESC'
    )

    mocks.queryRows.mockResolvedValue([{
      id: OPPORTUNITY_ID,
      opportunity_type: 'growth',
      query_text: 'haval h6 hybrid',
      page_url: 'https://example.com/h6',
      title: 'Protect growth',
      summary: 'Clicks grew.',
      score: 72,
      confidence: '1.0000',
      scoring_version: 'gsc-v1',
      reason_codes: [{ code: 'clicks_grew' }],
      lifecycle_status: 'new',
      evidence_start_date: '2026-07-01',
      evidence_end_date: '2026-07-28',
      task_id: null,
      data_through_date: '2026-07-30',
      provisional_from_date: '2026-07-20'
    }])
    const finalEvidence = await handler({} as never)
    expect(finalEvidence.opportunities[0]?.provider.provisional).toBe(false)
  })

  it('applies lifecycle, evidence-window and pagination filters in SQL', async () => {
    mocks.query = {
      clientId: CLIENT_ID,
      lifecycle: 'accepted',
      startDate: '2026-07-01',
      endDate: '2026-07-28',
      page: '2',
      pageSize: '10'
    }
    mocks.queryRows.mockResolvedValue([])
    mocks.queryOne.mockResolvedValue({ total: '14' })
    const handler = (await import(
      '~~/server/api/agency/search-authority/opportunities/index.get'
    )).default

    const result = await handler({} as never)

    expect(mocks.queryRows).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $5 OFFSET $6'),
      [
        CLIENT_ID,
        'accepted',
        '2026-07-01',
        '2026-07-28',
        10,
        10
      ]
    )
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 14 })
  })

  it('allows forward lifecycle transitions and rejects invalid jumps with 409', async () => {
    mocks.body = { clientId: CLIENT_ID, status: 'under_review' }
    mocks.queryOne.mockResolvedValue({
      id: OPPORTUNITY_ID,
      lifecycle_status: 'new'
    })
    mocks.execute.mockResolvedValue(1)
    const handler = (await import(
      '~~/server/api/agency/search-authority/opportunities/[id].patch'
    )).default

    await expect(handler({} as never)).resolves.toEqual({
      ok: true,
      status: 'under_review'
    })
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('AND lifecycle_status = $5'),
      [OPPORTUNITY_ID, CLIENT_ID, 'under_review', false, 'new']
    )

    mocks.body = { clientId: CLIENT_ID, status: 'published' }
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 409 })

    mocks.queryOne.mockResolvedValue({
      id: OPPORTUNITY_ID,
      lifecycle_status: 'accepted'
    })
    mocks.body = { clientId: CLIENT_ID, status: 'task_created' }
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 409 })

    mocks.body = { clientId: CLIENT_ID, status: 'in_progress' }
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects a lifecycle transition that loses an update race', async () => {
    mocks.body = { clientId: CLIENT_ID, status: 'under_review' }
    mocks.queryOne.mockResolvedValue({
      id: OPPORTUNITY_ID,
      lifecycle_status: 'new'
    })
    mocks.execute.mockResolvedValue(0)
    const handler = (await import(
      '~~/server/api/agency/search-authority/opportunities/[id].patch'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 409 })
  })
})
