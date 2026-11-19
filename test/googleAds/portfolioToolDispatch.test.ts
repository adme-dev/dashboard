import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const db = vi.hoisted(() => ({ queryRows: vi.fn() }))
const authority = vi.hoisted(() => ({ fresh: vi.fn(), covers: vi.fn() }))
vi.mock('~~/server/utils/db', async orig => ({ ...(await orig<object>()), queryRows: db.queryRows }))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: authority.fresh }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', async orig => ({ ...(await orig<object>()), freshContextCoversClient: authority.covers }))

const { executeGoogleAdsTool, getGoogleAdsToolSchema, googleAdsReadTools } = await import('~~/server/utils/ai/mcp/googleAdsTools')
const { listPortfolioAccounts } = await import('~~/server/utils/ai/mcp/googleAdsServer')
const { ADS_STAFF_READ_NAMES } = await import('~~/server/utils/ai/mcp/marketingTask4Names')

const staff = { userId: 'garrix', userRole: 'media_buyer', source: 'mcp', event: {}, mcpStaffAuthority: 'fresh', marketingCapabilities: ['reporting'] } as unknown as ToolContext
const flags = { read: true, write: false, automation: false, destructive: false }
const UUID = '11111111-1111-4111-8111-111111111111'

describe('new Google Ads read tools', () => {
  it('are registered read tools that marketing staff can reach (reporting or ads_plan)', () => {
    for (const name of ['google_ads_list_search_terms', 'google_ads_review_portfolio']) {
      expect(googleAdsReadTools.map(tool => tool.name)).toContain(name)
      expect(ADS_STAFF_READ_NAMES).toContain(name)
      expect((googleAdsReadTools.find(tool => tool.name === name)!.inputSchema as { type?: string }).type).toBe('object')
    }
  })

  it('dispatches typed arguments with defaults and rejects invalid ones', async () => {
    const deps = { listSearchTerms: vi.fn(async () => ({ items: [] })), reviewPortfolio: vi.fn(async () => ({ accounts: [] })) }
    expect(await executeGoogleAdsTool('google_ads_list_search_terms', { clientId: UUID, connectionId: UUID, wastedOnly: true }, staff, flags, deps as never))
      .toEqual({ ok: true, data: { items: [] } })
    expect(deps.listSearchTerms).toHaveBeenCalledWith(expect.objectContaining({ windowDays: 30, maxResults: 100, wastedOnly: true }), staff)
    expect(await executeGoogleAdsTool('google_ads_review_portfolio', {}, staff, flags, deps as never)).toMatchObject({ ok: true })
    expect(deps.reviewPortfolio).toHaveBeenCalledWith(expect.objectContaining({ sections: ['recommendations', 'conversion_actions', 'search_terms'], windowDays: 30, maxAccounts: 50 }), staff)
    expect(await executeGoogleAdsTool('google_ads_list_search_terms', { clientId: UUID, connectionId: UUID, windowDays: 45 }, staff, flags, deps as never))
      .toMatchObject({ ok: false, code: 'bad_args' })
    expect(getGoogleAdsToolSchema('google_ads_review_portfolio')!.safeParse({ sections: [] }).success).toBe(false)
  })

  it('is refused when Google Ads read is switched off or the caller has no Ads capability', async () => {
    const deps = { reviewPortfolio: vi.fn() }
    expect(await executeGoogleAdsTool('google_ads_review_portfolio', {}, staff, { ...flags, read: false }, deps as never)).toMatchObject({ ok: false, code: 'disabled' })
    expect(await executeGoogleAdsTool('google_ads_review_portfolio', {}, { ...staff, marketingCapabilities: ['social_draft'] } as ToolContext, flags, deps as never)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(deps.reviewPortfolio).not.toHaveBeenCalled()
  })
})

describe('portfolio account scope', () => {
  const rows = [
    { clientId: 'c1', clientName: 'Alpha', connectionId: 'k1', customerId: '1' },
    { clientId: 'c2', clientName: 'Beta', connectionId: 'k2', customerId: '2' }
  ]
  beforeEach(() => {
    vi.clearAllMocks()
    db.queryRows.mockResolvedValue(rows)
  })

  it('staff only see bound accounts for clients they currently cover', async () => {
    authority.fresh.mockResolvedValue({ ...staff, marketingCapabilities: ['reporting'] })
    authority.covers.mockImplementation(async (_ctx: unknown, clientId: string) => clientId === 'c2')
    expect((await listPortfolioAccounts(staff, null, 50)).map(r => r.clientId)).toEqual(['c2'])
    expect(db.queryRows.mock.calls[0]![0]).toContain('FROM google_ads_account_bindings')
  })

  it('staff without a Google Ads capability get nothing; maxAccounts caps the list', async () => {
    authority.fresh.mockResolvedValue({ ...staff, marketingCapabilities: ['social_draft'] })
    expect(await listPortfolioAccounts(staff, null, 50)).toEqual([])
    authority.fresh.mockResolvedValue({ ...staff, marketingCapabilities: ['ads_plan'] })
    authority.covers.mockResolvedValue(true)
    expect(await listPortfolioAccounts(staff, null, 1)).toHaveLength(1)
  })

  it('passes the client filter and any request client scope to SQL', async () => {
    authority.fresh.mockResolvedValue({ ...staff })
    authority.covers.mockResolvedValue(true)
    await listPortfolioAccounts({ ...staff, clientScope: 'c1' } as ToolContext, ['c1', 'c2'], 50)
    expect(db.queryRows.mock.calls[0]![1]).toEqual([['c1', 'c2'], 'c1'])
  })
})
