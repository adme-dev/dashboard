import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockTransaction = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const {
  createSiteIntelligenceDomain,
  getSiteIntelligenceDomainForActor,
  listSiteIntelligenceDomains,
  updateSiteIntelligenceDomain
} = await import('~~/server/utils/siteIntelligence/repository')

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const DOMAIN_A = '22222222-2222-4222-8222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const domainRow = {
  id: DOMAIN_A,
  client_id: CLIENT_A,
  client_name: 'Alpha Motors',
  lane: 'competitor',
  name: 'Bravo GWM',
  origin: 'https://bravo.example.com',
  justification: 'Monitor approved public offers.',
  approved_by: USER_A,
  approved_at: '2026-08-01T01:00:00.000Z',
  status: 'active',
  discovery_mode: 'sitemaps',
  include_patterns: [],
  exclude_patterns: [],
  include_subdomains: false,
  render_mode: 'auto',
  page_limit: 100,
  crawl_depth: 2,
  frequency: 'daily',
  crawl_purposes: ['search'],
  ai_input_allowed: false,
  retention_days: 30,
  last_run_at: null,
  next_run_at: null,
  latest_run_status: null,
  created_at: '2026-08-01T01:00:00.000Z',
  updated_at: '2026-08-01T01:00:00.000Z'
}

const domainInput = {
  clientId: CLIENT_A,
  lane: 'competitor' as const,
  name: 'Bravo GWM',
  origin: 'https://bravo.example.com',
  justification: 'Monitor approved public offers.',
  status: 'active' as const,
  discoveryMode: 'sitemaps' as const,
  includePatterns: [],
  excludePatterns: [],
  includeSubdomains: false,
  renderMode: 'auto' as const,
  pageLimit: 100,
  depth: 2,
  frequency: 'daily' as const,
  crawlPurposes: ['search' as const],
  aiInputAllowed: false,
  retentionDays: 30
}

beforeEach(() => {
  mockQueryRows.mockReset()
  mockQueryOne.mockReset()
  mockTransaction.mockReset()
})

describe('site intelligence domain repository', () => {
  it('returns no rows and does not query for an empty client scope', async () => {
    await expect(listSiteIntelligenceDomains([], {})).resolves.toEqual([])
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('scopes list SQL to assigned clients and maps safe public fields', async () => {
    mockQueryRows.mockResolvedValue([domainRow])

    const result = await listSiteIntelligenceDomains([CLIENT_A], { lane: 'competitor' })

    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('d.client_id = ANY($1::uuid[])'),
      [[CLIENT_A], 'competitor']
    )
    expect(result).toEqual([{
      id: DOMAIN_A,
      clientId: CLIENT_A,
      clientName: 'Alpha Motors',
      lane: 'competitor',
      name: 'Bravo GWM',
      origin: 'https://bravo.example.com',
      justification: 'Monitor approved public offers.',
      approvedBy: USER_A,
      approvedAt: '2026-08-01T01:00:00.000Z',
      status: 'active',
      discoveryMode: 'sitemaps',
      includePatterns: [],
      excludePatterns: [],
      includeSubdomains: false,
      renderMode: 'auto',
      pageLimit: 100,
      depth: 2,
      frequency: 'daily',
      crawlPurposes: ['search'],
      aiInputAllowed: false,
      retentionDays: 30,
      lastRunAt: null,
      nextRunAt: null,
      latestRunStatus: null,
      createdAt: '2026-08-01T01:00:00.000Z',
      updatedAt: '2026-08-01T01:00:00.000Z'
    }])
    expect(JSON.stringify(result)).not.toMatch(/metadata|actor|token|pageBody/i)
  })

  it('creates the domain and audit evidence in one transaction', async () => {
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [domainRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-id' }] })
    mockTransaction.mockImplementation(async callback => callback({ query: txQuery }))

    const result = await createSiteIntelligenceDomain({ id: USER_A }, domainInput)

    expect(result.id).toBe(DOMAIN_A)
    expect(txQuery).toHaveBeenCalledTimes(2)
    expect(txQuery.mock.calls[0]?.[0]).toContain('INSERT INTO site_intelligence_domains')
    expect(txQuery.mock.calls[1]?.[0]).toContain('INSERT INTO site_intelligence_audit_events')
    expect(txQuery.mock.calls[1]?.[0]).toContain('$6::jsonb')
    expect(txQuery.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([
      CLIENT_A,
      USER_A,
      'domain.created',
      'domain',
      DOMAIN_A
    ]))
  })

  it('updates only a domain in the same tenant and records changed fields', async () => {
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ ...domainRow, name: 'Bravo Haval' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-id' }] })
    mockTransaction.mockImplementation(async callback => callback({ query: txQuery }))

    const result = await updateSiteIntelligenceDomain(
      { id: USER_A },
      DOMAIN_A,
      { ...domainInput, name: 'Bravo Haval' }
    )

    expect(result?.name).toBe('Bravo Haval')
    expect(txQuery.mock.calls[0]?.[0]).toContain('WHERE id = $1 AND client_id = $2')
    expect(txQuery.mock.calls[0]?.[1]?.slice(0, 2)).toEqual([DOMAIN_A, CLIENT_A])
    expect(JSON.parse(txQuery.mock.calls[1]?.[1]?.at(-1) as string)).toMatchObject({
      changedFields: expect.arrayContaining(['name'])
    })
  })

  it('fails closed when a requested domain is outside the caller scope', async () => {
    mockQueryOne.mockResolvedValue(null)

    await expect(getSiteIntelligenceDomainForActor([CLIENT_A], DOMAIN_A)).resolves.toBeNull()
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('client_id = ANY($2::uuid[])'),
      [DOMAIN_A, [CLIENT_A]]
    )
  })
})
