import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  setResponseHeader: (...args: unknown[]) => void
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.setResponseHeader = vi.fn()

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryCount = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryCount: (...args: unknown[]) => mockQueryCount(...args)
}))

const { default: listHandler } = await import(
  '../../../../server/api/leads/list.get'
)
const { default: exportHandler } = await import(
  '../../../../server/api/leads/export.get'
)

describe('agency leads filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryCount.mockResolvedValue(0)
  })

  it('filters agency lead list by campaign and date context', async () => {
    mockQueryRows.mockResolvedValueOnce([{ id: 'lead-1' }])
    mockQueryCount.mockResolvedValueOnce(1)

    const result = await listHandler({
      query: {
        client_id: '00000000-0000-4000-8000-000000000001',
        source: 'google',
        campaign_id: 'camp-1',
        campaign_name: 'Client Search',
        from: '2026-05-01',
        to: '2026-05-27'
      }
    })

    expect(result.total).toBe(1)
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    const params = mockQueryRows.mock.calls[0]?.[1]
    expect(sql).toContain('client_id = $1')
    expect(sql).toContain('source = $2')
    expect(sql).toContain('campaign_id = $3')
    expect(sql).toContain('campaign_name = $4')
    expect(sql).toContain('submitted_at >= $5')
    expect(sql).toContain('submitted_at < ($6::date + INTERVAL \'1 day\')')
    expect(params).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'google',
      'camp-1',
      'Client Search',
      '2026-05-01',
      '2026-05-27'
    ])
  })

  it('exports agency leads with the same campaign filters', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        submitted_at: '2026-05-27T00:00:00Z',
        source: 'google',
        form_name: 'Lead Form',
        campaign_name: 'Client Search',
        ad_name: 'Ad A',
        status: 'new',
        assigned_to: null,
        client_id: '00000000-0000-4000-8000-000000000001',
        field_data: { email: 'jane@example.com' },
        attribution: {}
      }
    ])

    const csv = await exportHandler({
      query: {
        client_id: '00000000-0000-4000-8000-000000000001',
        source: 'google',
        campaign_id: 'camp-1',
        campaign_name: 'Client Search'
      }
    })

    expect(csv).toContain('submitted_at,source,form_name,campaign_name,ad_name,status')
    expect(csv).toContain('Client Search')
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    const params = mockQueryRows.mock.calls[0]?.[1]
    expect(sql).toContain('campaign_id = $3')
    expect(sql).toContain('campaign_name = $4')
    expect(params).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'google',
      'camp-1',
      'Client Search'
    ])
  })
})
