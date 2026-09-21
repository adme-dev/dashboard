import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rows: vi.fn(), one: vi.fn(), cache: vi.fn(), query: vi.fn(), body: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryRows: mocks.rows, queryOne: mocks.one }))
vi.mock('~~/server/utils/kv', () => ({ cachedFetch: mocks.cache }))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', mocks.query)
vi.stubGlobal('readBody', mocks.body)
const sources = import.meta.glob('../../../server/api/agency/social/*/{map-client.post,accounts.get,account-spend.get,account-campaigns.get}.ts')
const providers = ['linkedin', 'microsoft_ads', 'pinterest', 'snapchat', 'tiktok', 'twitter'] as const
const mappingProviders = ['google', 'meta', ...providers]
const routes = mappingProviders.map(provider => ({ provider, file: 'map-client.post' }))
  .concat(providers.flatMap(provider => ['accounts.get', 'account-spend.get', 'account-campaigns.get'].map(file => ({ provider, file }))))
const event = { context: {} } as never
async function handler(provider: string, file: string) {
  const load = sources[`../../../server/api/agency/social/${provider}/${file}.ts`]
  if (!load) throw new Error('Missing selected social route')
  return (await load() as { default: (event: unknown) => Promise<unknown> }).default
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T12:00:00Z'))
  mocks.auth.mockResolvedValue({ id: 'staff' })
  mocks.query.mockReturnValue({ connectionId: 'connection', month: '2', year: '2025', platform: 'injected' })
  mocks.body.mockResolvedValue({ connectionId: 'connection', xeroClientName: 'Client', campaignId: '', campaignNamePattern: '', xeroClientCode: '', platform: 'injected' })
  mocks.rows.mockResolvedValue([])
  mocks.one.mockResolvedValue({ id: 'connection' })
  mocks.cache.mockImplementation(async (_event: unknown, _key: string, _ttl: number, work: () => Promise<unknown>) => work())
})
afterEach(() => vi.useRealTimers())

describe('shared social account routes preserve native behavior', () => {
  it.each(routes)('denies $provider/$file before parsing input, cache or SQL', async ({ provider, file }) => {
    mocks.auth.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 401 }))
    await expect((await handler(provider, file))(event)).rejects.toMatchObject({ statusCode: 401 })
    for (const fn of [mocks.body, mocks.query, mocks.rows, mocks.one, mocks.cache]) expect(fn).not.toHaveBeenCalled()
  })
  it.each(mappingProviders)('%s mapping updates the existing mapping with original null defaults', async (provider) => {
    mocks.one.mockResolvedValueOnce({ id: 'connection' }).mockResolvedValueOnce({ id: 'mapping' }).mockResolvedValueOnce({ id: 'mapping' })
    expect(await (await handler(provider, 'map-client.post'))(event)).toEqual({ id: 'mapping', updated: true })
    expect(mocks.one.mock.calls.map(call => call[1])).toEqual([['connection'], ['connection', null, null], ['Client', null, 'mapping']])
    expect(mocks.one.mock.calls[0]![0]).toContain('SELECT id FROM social_connections WHERE id = $1')
    expect(mocks.one.mock.calls[1]![0]).toContain('COALESCE(campaign_name_pattern, \'\') = COALESCE($3, \'\')')
    expect(mocks.one.mock.calls[2]![0]).toContain('UPDATE ad_account_client_map')
  })
  it.each(mappingProviders)('%s mapping inserts only after connection and existing mapping checks', async (provider) => {
    mocks.one.mockResolvedValueOnce({ id: 'connection' }).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'new-map' })
    expect(await (await handler(provider, 'map-client.post'))(event)).toEqual({ id: 'new-map', updated: false })
    expect(mocks.one.mock.calls[2]![0]).toContain('INSERT INTO ad_account_client_map')
    expect(mocks.one.mock.calls[2]![1]).toEqual(['connection', null, null, 'Client', null])
  })
  it('retains mapping input and missing-connection errors before mutations', async () => {
    const run = await handler('google', 'map-client.post')
    mocks.body.mockResolvedValueOnce({ connectionId: 'connection' })
    await expect(run(event)).rejects.toMatchObject({ statusCode: 400, statusMessage: 'connectionId and xeroClientName are required' })
    expect(mocks.one).not.toHaveBeenCalled()
    mocks.one.mockResolvedValueOnce(null)
    await expect(run(event)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Connection not found' })
    expect(mocks.one).toHaveBeenCalledTimes(1)
  })
  it.each(providers)('%s reads retain hardcoded platform boundaries, cache keys and period arguments', async (provider) => {
    await (await handler(provider, 'accounts.get'))(event)
    expect(mocks.rows.mock.calls[0]![0]).toContain(`sc.platform = '${provider}'`)
    expect(mocks.rows.mock.calls[0]).toHaveLength(1)
    await (await handler(provider, 'account-spend.get'))(event)
    expect(mocks.cache).toHaveBeenCalledWith(event, `spend:${provider}:accounts:2025-02`, 300, expect.any(Function))
    expect(mocks.rows.mock.calls[1]![0]).toContain(`sc.platform = '${provider}' AND sc.status = 'active'`)
    expect(mocks.rows.mock.calls[1]![1]).toEqual(['2025-02'])
    await (await handler(provider, 'account-campaigns.get'))(event)
    expect(mocks.rows.mock.calls[2]![0]).toContain(`platform = '${provider}'`)
    expect(mocks.rows.mock.calls[2]![1]).toEqual(['connection', '2025-02'])
    for (const call of mocks.rows.mock.calls) expect(call[0]).not.toContain('injected')
  })
  it('keeps date defaults, cache hits and missing campaign connection behavior', async () => {
    mocks.query.mockReturnValue({ month: '0', year: 'invalid' })
    const run = await handler('linkedin', 'account-spend.get')
    mocks.cache.mockResolvedValueOnce([{ cached: true }])
    expect(await run(event)).toEqual([{ cached: true }])
    expect(mocks.cache.mock.calls[0]![1]).toBe('spend:linkedin:accounts:2026-09')
    expect(mocks.rows).not.toHaveBeenCalled()
    await expect((await handler('linkedin', 'account-campaigns.get'))(event)).rejects.toMatchObject({ statusCode: 400, statusMessage: 'connectionId is required' })
    expect(mocks.rows).not.toHaveBeenCalled()
  })
  it('preserves list defaults, numeric spend coercion and campaign fallback output', async () => {
    mocks.rows.mockResolvedValueOnce([{ id: 'a', scopes: null, metadata: null, mapped_clients: '4' }])
    expect(await (await handler('linkedin', 'accounts.get'))(event)).toEqual([expect.objectContaining({ id: 'a', scopes: [], metadata: {}, mappedClients: 4 })])
    mocks.rows.mockResolvedValueOnce([{ id: 'a', total_spend: '12.5', total_budget: 'bad', total_impressions: '13', total_clicks: '2', total_conversions: '1.5', total_commission: '0.4', max_commission_rate: null, campaign_count: 3 }])
    expect(await (await handler('linkedin', 'account-spend.get'))(event)).toEqual([expect.objectContaining({ totalSpend: 12.5, totalBudget: 0, totalImpressions: 13, totalClicks: 2, totalConversions: 1.5, totalCommission: 0.4, commissionRate: 0, campaignCount: 3 })])
    mocks.rows.mockResolvedValueOnce([{ id: 'row', campaign_id: '', campaign_name: 'Campaign', actual_spend: 5, budget_allocated: 9, budget_rolling: false, commission_rate: null }])
    expect(await (await handler('linkedin', 'account-campaigns.get'))(event)).toEqual([expect.objectContaining({ id: 'row', campaignId: 'row', campaignName: 'Campaign', spend: 5, budget: 9, rolling: false, commissionRate: 0 })])
  })
  it('rejects unsupported factory platforms before constructing any SQL', async () => {
    const shared = await import('~~/server/utils/social/accountHandlers')
    for (const name of ['createSocialAccountsHandler', 'createSocialAccountSpendHandler', 'createSocialAccountCampaignsHandler'] as const) {
      expect(() => shared[name]('linkedin\' OR 1=1 --' as never)).toThrow('Unsupported social account provider')
      expect(() => shared[name]('google' as never)).toThrow('Unsupported social account provider')
    }
    expect(mocks.rows).not.toHaveBeenCalled()
  })
})
