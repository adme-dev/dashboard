import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { syncLinkedinSpend } from '../../server/utils/spendSync'

const mocks = vi.hoisted(() => ({ http: vi.fn(), queryRows: vi.fn(), queryOne: vi.fn() }))
vi.mock('ofetch', () => ({ ofetch: mocks.http }))
vi.mock('~~/server/utils/db', () => ({ queryRows: mocks.queryRows, queryOne: mocks.queryOne }))
vi.mock('~~/server/utils/email', () => ({ getCachedBinding: vi.fn() }))

const campaign = {
  pivotValues: ['urn:li:sponsoredCampaign:456'], costInLocalCurrency: '12.50',
  impressions: 100, clicks: 8, externalWebsiteConversions: 2,
  dateRange: { start: { year: 2026, month: 10, day: 9 }, end: { year: 2026, month: 10, day: 9 } }
}
let connection: Record<string, any>
let mappings: any[]
let existing: { id: string } | null

describe('LinkedIn Ads spend sync', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('useRuntimeConfig', () => ({ linkedinClientId: 'app', linkedinClientSecret: 'secret' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    connection = {
      id: 'connection', client_id: 'client', account_id: '123', account_name: 'Account',
      access_token: 'old-token', refresh_token: 'refresh', token_expires_at: '2099-01-01', metadata: {}
    }
    mappings = []
    existing = null
    mocks.queryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM social_connections')) return [connection]
      if (sql.includes('FROM ad_account_client_map')) return mappings
      if (sql.includes('FROM media_spend')) return [{ id: 'spend', campaign_id: '456' }]
      throw new Error('Unexpected rows query')
    })
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agency_clients WHERE id')) return { id: 'client', media_commission_rate: '10' }
      if (sql.includes('SELECT id FROM media_spend')) return existing
      if (sql.startsWith('UPDATE social_connections')) return { id: 'connection' }
      return null
    })
    mocks.http.mockImplementation(async (url: string) => {
      if (url.includes('/oauth/')) return { access_token: 'new-token', refresh_token: 'rotated-refresh', expires_in: 3600 }
      if (url.includes('/adAnalytics')) return { elements: [campaign] }
      if (url.includes('/adCampaigns')) return { elements: [{ id: 456, name: 'Campaign' }] }
      throw new Error('Unexpected HTTP request')
    })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('returns an empty failures list when no accounts are connected', async () => {
    mocks.queryRows.mockResolvedValue([])
    expect(await syncLinkedinSpend(10, 2026)).toEqual({ synced: 0, totalSpend: 0, failures: [] })
    expect(mocks.http).not.toHaveBeenCalled()
  })

  it('reports refresh failures instead of successful zero spend and sanitizes credentials', async () => {
    connection.token_expires_at = '2000-01-01'
    mocks.http.mockRejectedValue(new Error('Refresh failed refresh_token=private-token'))
    const result = await syncLinkedinSpend(10, 2026)
    expect(result).toEqual({ synced: 0, totalSpend: 0, failures: [
      { account: 'Account', reason: expect.stringContaining('Refresh failed refresh_token=[redacted]') }
    ] })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-token')
    expect(mocks.http).toHaveBeenCalledTimes(1)
  })

  it('reports an expired token without refresh credentials before requesting analytics', async () => {
    connection.token_expires_at = '2000-01-01'
    connection.refresh_token = null
    expect(await syncLinkedinSpend(10, 2026)).toMatchObject({ synced: 0, failures: [
      { account: 'Account', reason: expect.stringMatching(/reconnect/i) }
    ] })
    expect(mocks.http).not.toHaveBeenCalled()
  })

  it('reports analytics failures and continues syncing other accounts', async () => {
    mocks.queryRows.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM social_connections')) return [connection, { ...connection, id: 'other', account_id: '999', account_name: 'Other' }]
      return []
    })
    mocks.http.mockRejectedValueOnce(new Error('Analytics denied access_token=private-token'))
    const result = await syncLinkedinSpend(10, 2026)
    expect(result).toEqual({ synced: 1, totalSpend: 12.5, failures: [
      { account: 'Account', reason: expect.stringContaining('Analytics denied access_token=[redacted]') }
    ] })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-token')
  })

  it('surfaces daily API failure while retaining the monthly success', async () => {
    mocks.http.mockImplementation(async (url: string, options: any) => {
      if (url.includes('timeGranularity=DAILY') || options.query?.timeGranularity === 'DAILY') throw new Error('Daily denied')
      if (url.includes('/adAnalytics')) return { elements: [campaign] }
      return { elements: [{ id: 456, name: 'Campaign' }] }
    })
    expect(await syncLinkedinSpend(10, 2026)).toEqual({ synced: 1, totalSpend: 12.5, failures: [
      { account: 'Account', reason: expect.stringContaining('Daily denied') }
    ] })
  })

  it('persists refresh rotation and uses the refreshed token for monthly and daily requests', async () => {
    connection.token_expires_at = '2000-01-01'
    const before = Date.now()
    await syncLinkedinSpend(10, 2026)
    const update = mocks.queryOne.mock.calls.find(([sql]) => sql.startsWith('UPDATE social_connections'))!
    expect(update[1]).toEqual(['new-token', 'rotated-refresh', expect.any(Date), 'connection', 'old-token'])
    expect(update[1][2].getTime()).toBeGreaterThanOrEqual(before + 3600000)
    const analyticsCalls = mocks.http.mock.calls.filter(([url]) => url.includes('/adAnalytics'))
    expect(analyticsCalls).toHaveLength(2)
    expect(analyticsCalls.every(([, options]) => options.headers.Authorization === 'Bearer new-token')).toBe(true)
  })

  it.each([false, true])('uses the connection client and commission for spend writes (existing=%s)', async (hasExisting) => {
    existing = hasExisting ? { id: 'spend' } : null
    expect(await syncLinkedinSpend(10, 2026)).toEqual({ synced: 1, totalSpend: 12.5, failures: [] })
    expect(mocks.queryRows.mock.calls[0][0]).toMatch(/SELECT[^]*client_id[^]*FROM social_connections/)
    const write = mocks.queryOne.mock.calls.find(([sql]) => sql.includes(hasExisting ? 'UPDATE media_spend SET' : 'INSERT INTO media_spend'))!
    expect(write[1][hasExisting ? 5 : 0]).toBe('client')
    expect(write[1][hasExisting ? 7 : 3]).toBe(10)
  })

  it.each([false, true])('preserves client fallback unless a campaign mapping resolves (resolved=%s)', async (resolved) => {
    mappings = [{ connection_id: 'connection', campaign_id: '456', campaign_name_pattern: null, xero_client_name: 'Mapped', xero_client_code: null }]
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agency_clients WHERE id')) return { id: 'client', media_commission_rate: '10' }
      if (sql.includes('FROM agency_clients WHERE name')) return resolved ? { id: 'mapped-client', media_commission_rate: '15' } : null
      return null
    })
    await syncLinkedinSpend(10, 2026)
    const write = mocks.queryOne.mock.calls.find(([sql]) => sql.includes('INSERT INTO media_spend'))!
    expect(write[1][0]).toBe(resolved ? 'mapped-client' : 'client')
    expect(write[1][3]).toBe(resolved ? 15 : 10)
  })
})
