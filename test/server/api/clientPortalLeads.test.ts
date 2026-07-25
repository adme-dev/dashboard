import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  setResponseHeader: (...args: unknown[]) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.setResponseHeader = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryCount = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockMoveLeadStatus = vi.fn()
const mockPublishConversion = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryCount: (...args: unknown[]) => mockQueryCount(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/leads/statusTransition', () => ({
  leadStatusTransitionService: {
    move: (...args: unknown[]) => mockMoveLeadStatus(...args)
  }
}))

vi.mock('~~/server/utils/measurement/publisher', () => ({
  conversionOutboxPublisher: {
    publishEvent: (...args: unknown[]) => mockPublishConversion(...args)
  }
}))

const { default: listHandler } = await import(
  '../../../../server/api/client-portal/leads/list.get'
)
const { default: detailHandler } = await import(
  '../../../../server/api/client-portal/leads/[id].get'
)
const { default: contactedHandler } = await import(
  '../../../../server/api/client-portal/leads/[id]/contacted.post'
)
const { default: exportHandler } = await import(
  '../../../../server/api/client-portal/leads/export.get'
)

describe('client portal leads API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      clientId: '22222222-2222-4222-8222-222222222222',
      canManageLeadOutcomes: true
    })
    mockQueryRows.mockResolvedValue([])
    mockQueryCount.mockResolvedValue(0)
    mockQueryOne.mockResolvedValue(null)
    mockExecute.mockResolvedValue(0)
    mockMoveLeadStatus.mockResolvedValue({ status: 'moved', outbox: null })
    mockPublishConversion.mockResolvedValue({ status: 'published' })
  })

  it('lists only client-owned portal-visible leads and supports source/search filters', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{ id: 'lead-1', source: 'webhook' }])
      .mockResolvedValueOnce([{ status: 'new', count: '1' }])
      .mockResolvedValueOnce([{ source: 'webhook', count: '1' }])
      .mockResolvedValueOnce([{ total: '1', contacted: '0', qualified: '0', won: '0', avg_response_minutes: null }])
    mockQueryCount.mockResolvedValueOnce(1)

    const result = await listHandler({
      query: { source: 'webhook', search: 'Jane', status: 'all' }
    })

    expect(result).toMatchObject({
      total: 1,
      items: [{ id: 'lead-1' }],
      sourceStats: [{ source: 'webhook', count: '1' }],
      responseSummary: { total: '1', contacted: '0', qualified: '0', won: '0', avg_response_minutes: null }
    })
    expect(mockRequireClientAuth).toHaveBeenCalledOnce()
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    const params = mockQueryRows.mock.calls[0]?.[1]
    expect(sql).toContain('l.client_id = $1')
    expect(sql).toContain('d.destination_type = \'portal\'')
    expect(sql).toContain('r.enabled = TRUE')
    expect(sql).toContain('l.source = $2')
    expect(sql).toContain('l.field_data::text ILIKE $3')
    expect(params).toEqual(['22222222-2222-4222-8222-222222222222', 'webhook', '%Jane%'])
  })

  it('filters client-visible leads by campaign and submitted date range', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{ id: 'lead-1', campaign_name: 'Client Search' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mockQueryCount.mockResolvedValueOnce(1)

    await listHandler({
      query: {
        source: 'google',
        campaignId: 'camp-1',
        campaign: 'Client Search',
        from: '2026-05-01',
        to: '2026-05-27'
      }
    })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    const params = mockQueryRows.mock.calls[0]?.[1]
    expect(sql).toContain('l.submitted_at >= $3::date')
    expect(sql).toContain('l.submitted_at < ($4::date + INTERVAL \'1 day\')')
    expect(sql).toContain('l.campaign_id = $5')
    expect(sql).toContain('l.campaign_name = $6')
    expect(params).toEqual(['22222222-2222-4222-8222-222222222222', 'google', '2026-05-01', '2026-05-27', 'camp-1', 'Client Search'])
  })

  it('scopes status summary counts to the current non-status filters', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{ id: 'lead-1', campaign_name: 'Client Search', status: 'new' }])
      .mockResolvedValueOnce([{ status: 'new', count: '3' }, { status: 'won', count: '1' }])
      .mockResolvedValueOnce([{ source: 'google', count: '4' }])
      .mockResolvedValueOnce([{ total: '4', contacted: '3', qualified: '1', won: '1', avg_response_minutes: '25.5' }])
    mockQueryCount.mockResolvedValueOnce(1)

    const result = await listHandler({
      query: {
        source: 'google',
        status: 'new',
        campaign_id: 'camp-1',
        campaign: 'Client Search',
        from: '2026-05-01',
        to: '2026-05-27'
      }
    })

    expect(result.stats).toEqual([{ status: 'new', count: '3' }, { status: 'won', count: '1' }])
    const listSql = String(mockQueryRows.mock.calls[0]?.[0])
    const statsSql = String(mockQueryRows.mock.calls[1]?.[0])
    const sourceStatsSql = String(mockQueryRows.mock.calls[2]?.[0])
    const responseSummarySql = String(mockQueryRows.mock.calls[3]?.[0])
    const listParams = mockQueryRows.mock.calls[0]?.[1]
    const statsParams = mockQueryRows.mock.calls[1]?.[1]
    const sourceStatsParams = mockQueryRows.mock.calls[2]?.[1]
    const responseSummaryParams = mockQueryRows.mock.calls[3]?.[1]
    expect(listSql).toContain('l.status = $7')
    expect(statsSql).toContain('l.campaign_id = $5')
    expect(statsSql).not.toContain('l.status =')
    expect(sourceStatsSql).toContain('GROUP BY l.source')
    expect(sourceStatsSql).not.toContain('l.status =')
    expect(responseSummarySql).toContain('avg_response_minutes')
    expect(responseSummarySql).not.toContain('AND l.status =')
    expect(listParams).toEqual(['22222222-2222-4222-8222-222222222222', 'google', '2026-05-01', '2026-05-27', 'camp-1', 'Client Search', 'new'])
    expect(statsParams).toEqual(['22222222-2222-4222-8222-222222222222', 'google', '2026-05-01', '2026-05-27', 'camp-1', 'Client Search'])
    expect(sourceStatsParams).toEqual(['22222222-2222-4222-8222-222222222222', 'google', '2026-05-01', '2026-05-27', 'camp-1', 'Client Search'])
    expect(responseSummaryParams).toEqual(['22222222-2222-4222-8222-222222222222', 'google', '2026-05-01', '2026-05-27', 'camp-1', 'Client Search'])
  })

  it('uses the same portal visibility rule for detail reads', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'lead-1' })

    const result = await detailHandler({ params: { id: 'lead-1' } })

    expect(result).toEqual({ lead: { id: 'lead-1' } })
    const sql = String(mockQueryOne.mock.calls[0]?.[0])
    expect(sql).toContain('l.id = $1 AND l.client_id = $2')
    expect(sql).toContain('d.destination_type = \'portal\'')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual(['lead-1', '22222222-2222-4222-8222-222222222222'])
  })

  it('requires portal visibility before marking a lead contacted', async () => {
    const result = await contactedHandler({ params: { id: 'lead-1' } })

    expect(result).toEqual({ ok: true })
    expect(mockMoveLeadStatus).toHaveBeenCalledWith(expect.objectContaining({
      clientId: '22222222-2222-4222-8222-222222222222',
      leadId: 'lead-1',
      toStatus: 'contacted',
      portalVisibleOnly: true,
      actor: {
        type: 'client_user',
        id: '11111111-1111-4111-8111-111111111111'
      }
    }))
  })

  it('exports only portal-visible leads', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        submitted_at: '2026-05-27T00:00:00Z',
        source: 'google',
        form_name: 'Test',
        campaign_name: 'Client Search',
        ad_name: 'Ad A',
        status: 'new',
        field_data: { email: 'jane@example.com' }
      }
    ])

    const csv = await exportHandler({
      query: {
        source: 'google',
        campaign_id: 'camp-1',
        campaign: 'Client Search',
        from: '2026-05-01',
        to: '2026-05-27'
      }
    })

    expect(csv).toContain('submitted_at,source,form_name,campaign_name,ad_name,status,field_data')
    expect(csv).toContain('Client Search')
    expect(csv).toContain('jane@example.com')
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    const params = mockQueryRows.mock.calls[0]?.[1]
    expect(sql).toContain('l.client_id = $1')
    expect(sql).toContain('l.source = $2')
    expect(sql).toContain('l.campaign_id = $5')
    expect(sql).toContain('l.campaign_name = $6')
    expect(sql).toContain('d.destination_type = \'portal\'')
    expect(params).toEqual(['22222222-2222-4222-8222-222222222222', 'google', '2026-05-01', '2026-05-27', 'camp-1', 'Client Search'])
  })
})
