import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ http: vi.fn(), queryOne: vi.fn(), queryRows: vi.fn(), auth: vi.fn() }))
vi.mock('ofetch', () => ({ ofetch: mocks.http }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne, queryRows: mocks.queryRows }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/kv', () => ({ cachedFetch: (_event: unknown, _key: string, _ttl: number, fn: () => unknown) => fn() }))

let connection: Record<string, any>
describe('LinkedIn Ads routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('eventHandler', (handler: unknown) => handler)
    vi.stubGlobal('getQuery', () => ({ connectionId: 'connection', month: '10', year: '2026' }))
    vi.stubGlobal('useRuntimeConfig', () => ({ linkedinClientId: 'app', linkedinClientSecret: 'secret' }))
    connection = { id: 'connection', account_id: '123', account_name: 'Account', access_token: 'expired', refresh_token: 'refresh', token_expires_at: '2000-01-01', status: 'active' }
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE social_connections')) return { id: 'connection' }
      return sql.includes('FROM social_connections') ? connection : null
    })
    mocks.http.mockImplementation(async (url: string) => url.includes('/oauth/')
      ? { access_token: 'fresh', expires_in: 3600 }
      : { elements: [] })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('refreshes and persists before fetching live insights', async () => {
    const handler = (await import('../../server/api/agency/social/linkedin/insights.get')).default
    const result = await handler({} as any)
    expect(result).toMatchObject({ accountId: '123', campaigns: [], totalSpend: 0 })
    expect(mocks.queryOne.mock.calls[0][0]).toContain('refresh_token')
    expect(mocks.queryOne.mock.calls[0][0]).toContain('token_expires_at')
    expect(mocks.http.mock.calls[0][0]).toBe('https://www.linkedin.com/oauth/v2/accessToken')
    expect(mocks.queryOne.mock.calls.find(([sql]) => sql.startsWith('UPDATE social_connections'))?.[1])
      .toEqual(['fresh', 'refresh', expect.any(Date), 'connection', 'expired'])
    expect(mocks.http.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh')
  })

  it('keeps a reconnect that landed while the refresh was in flight', async () => {
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE social_connections')) return null
      if (sql.startsWith('SELECT access_token FROM social_connections')) return { access_token: 'reconnected' }
      return sql.includes('FROM social_connections') ? connection : null
    })
    const handler = (await import('../../server/api/agency/social/linkedin/insights.get')).default
    await handler({} as any)
    expect(mocks.queryOne.mock.calls.find(([sql]) => sql.startsWith('UPDATE social_connections'))?.[0]).toContain('AND access_token = $5')
    expect(mocks.http.mock.calls[1][1].headers.Authorization).toBe('Bearer reconnected')
  })

  it.each(['2099-01-01', null])('does not refresh usable or unknown-expiry tokens (%s)', async (expiry) => {
    connection.token_expires_at = expiry
    const handler = (await import('../../server/api/agency/social/linkedin/insights.get')).default
    await handler({} as any)
    expect(mocks.http).toHaveBeenCalledTimes(1)
    expect(mocks.http.mock.calls[0][0]).toContain('/adAnalytics')
  })

  it('does not fetch insights after a refresh failure', async () => {
    mocks.http.mockRejectedValue(new Error('Refresh denied'))
    const handler = (await import('../../server/api/agency/social/linkedin/insights.get')).default
    await expect(handler({} as any)).rejects.toThrow('Refresh denied')
    expect(mocks.http).toHaveBeenCalledTimes(1)
    expect(mocks.http.mock.calls[0][0]).toContain('/oauth/v2/accessToken')
  })

  it('rejects unauthenticated live requests before accessing credentials', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    const handler = (await import('../../server/api/agency/social/linkedin/insights.get')).default
    await expect(handler({} as any)).rejects.toThrow('Unauthorized')
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.http).not.toHaveBeenCalled()
  })

  it('serves stored account spend without needing a usable LinkedIn token', async () => {
    mocks.queryRows.mockResolvedValue([{ id: 'connection', account_id: '123', total_spend: '12.50', campaign_count: 1 }])
    const handler = (await import('../../server/api/agency/social/linkedin/account-spend.get')).default
    expect(await handler({} as any)).toMatchObject([{ id: 'connection', totalSpend: 12.5, campaignCount: 1 }])
    expect(mocks.auth).toHaveBeenCalled()
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.http).not.toHaveBeenCalled()
  })

  it('serves stored campaigns without needing a usable LinkedIn token', async () => {
    mocks.queryRows.mockResolvedValue([{ id: 'spend', campaign_id: '456', campaign_name: 'Campaign', actual_spend: 12.5 }])
    const handler = (await import('../../server/api/agency/social/linkedin/account-campaigns.get')).default
    expect(await handler({} as any)).toMatchObject([{ campaignId: '456', campaignName: 'Campaign', spend: 12.5 }])
    expect(mocks.auth).toHaveBeenCalled()
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.http).not.toHaveBeenCalled()
  })
})
