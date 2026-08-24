import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: vi.fn(),
  dbQuery: vi.fn(),
  getGoogleCampaignSearchTerms: vi.fn(),
  resolveGoogleCredential: vi.fn(),
  resolveGoogleAdsRuntimeConfig: vi.fn(),
  refreshGoogleAccessTokenIfNeeded: vi.fn(),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  transaction: (...args: any[]) => mocks.transaction(...args),
}))
vi.mock('~~/server/utils/googleCredentialProfiles', () => ({
  GOOGLE_CREDENTIAL_PROFILE_JOIN: '',
  GOOGLE_CREDENTIAL_PROFILE_SELECT: 'NULL::uuid AS google_credential_profile_id',
  persistGoogleCredentialRefresh: vi.fn(),
  resolveGoogleCredential: (...args: unknown[]) => mocks.resolveGoogleCredential(...args),
}))
vi.mock('~~/server/utils/googleAdsClient', () => ({
  getGoogleCampaignSearchTerms: (...args: unknown[]) => mocks.getGoogleCampaignSearchTerms(...args),
  refreshGoogleToken: vi.fn(),
}))
vi.mock('~~/server/utils/spendSync', () => ({
  resolveGoogleAdsRuntimeConfig: (...args: unknown[]) => mocks.resolveGoogleAdsRuntimeConfig(...args),
}))
vi.mock('~~/server/utils/onDemandSync', () => ({
  refreshGoogleAccessTokenIfNeeded: (...args: unknown[]) => mocks.refreshGoogleAccessTokenIfNeeded(...args),
}))

import {
  resolveSearchTermTarget,
  syncCampaignSearchTerms,
  type SearchTermTarget,
} from '~~/server/utils/adSearchTerms'

const target: SearchTermTarget = {
  mediaSpendId: 'ms-1',
  campaignId: '123',
  campaignName: 'Search campaign',
  campaignType: 'SEARCH',
  platform: 'google',
  clientId: 'client-1',
  clientName: 'Acme',
  connectionId: 'conn-1',
}

describe('campaign search-term storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('useRuntimeConfig', () => ({
      googleClientId: 'client', googleClientSecret: 'secret', googleDeveloperToken: 'dev', googleAdsLoginCustomerId: '',
    }))
    mocks.transaction.mockImplementation(async (callback: any) => callback({ query: mocks.dbQuery }))
    mocks.resolveGoogleCredential.mockResolvedValue({
      accessToken: 'token', refreshToken: null, tokenExpiresAt: null, profileId: null,
    })
    mocks.resolveGoogleAdsRuntimeConfig.mockReturnValue({
      googleClientId: 'cloudflare-client',
      googleClientSecret: 'cloudflare-secret',
      googleDeveloperToken: 'cloudflare-developer-token',
      googleAdsLoginCustomerId: 'cloudflare-manager',
    })
    mocks.refreshGoogleAccessTokenIfNeeded.mockResolvedValue('fresh-token')
  })

  it('narrows target resolution to the authenticated assigned-client scope', async () => {
    mocks.queryOne.mockResolvedValue({
      id: 'ms-1', campaign_id: '123', campaign_name: 'Search campaign', campaign_type: 'SEARCH',
      platform: 'google_ads', client_id: 'client-1', client_name: 'Acme', connection_id: 'conn-1',
    })
    const result = await resolveSearchTermTarget({ campaignName: 'Search' }, {
      userId: 'u1', userRole: 'media_buyer', event: {} as any,
      assistantScope: { departmentIds: [], clientAccessMode: 'assigned', assignedClientIds: ['client-1'], catalogReleaseIds: [] },
    })
    expect(result).toMatchObject({ mediaSpendId: 'ms-1', platform: 'google' })
    expect(String(mocks.queryOne.mock.calls[0]?.[0])).toContain('ms.client_id = ANY')
    expect(mocks.queryOne.mock.calls[0]?.[1]).toContainEqual(['client-1'])
  })

  it('records a failed attempt without deleting the prior successful snapshot', async () => {
    mocks.queryOne
      .mockResolvedValueOnce({
        id: 'conn-1', access_token: 'token', refresh_token: null, token_expires_at: null,
        account_id: '1', metadata: {}, google_credential_profile_id: null,
      })
      .mockResolvedValueOnce({ id: 'sync-1' })
      .mockResolvedValueOnce({
        id: 'sync-1', coverage: 'full', coverage_reason: 'Search coverage',
        synced_at: '2026-08-23T00:00:00Z', last_attempted_at: '2026-08-24T00:00:00Z',
        last_error: 'Google unavailable', source_total: 1, truncated_at_source: false,
      })
    mocks.queryRows.mockResolvedValue([{ search_term: 'brand dealer', match_type: 'EXACT', targeting_status: 'ADDED', impressions: 10, clicks: 2, cost: 5 }])
    mocks.getGoogleCampaignSearchTerms.mockRejectedValue(new Error('Google unavailable'))

    const result = await syncCampaignSearchTerms(target, '2026-08-01', '2026-08-24')
    expect(result).toMatchObject({
      coverage: 'full',
      asOf: '2026-08-23T00:00:00Z',
      lastError: 'Google unavailable',
      terms: [expect.objectContaining({ searchTerm: 'brand dealer', cost: 5 })],
    })
    expect(String(mocks.queryOne.mock.calls[1]?.[0])).toContain('campaign_search_term_syncs.synced_at IS NULL')
    expect(mocks.dbQuery).not.toHaveBeenCalledWith(expect.stringMatching(/^DELETE/i), expect.anything())
  })

  it('uses the Cloudflare-aware config and shared token refresh path for provider requests', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({}))
    mocks.queryOne
      .mockResolvedValueOnce({
        id: 'conn-1', access_token: 'expired-token', refresh_token: 'refresh-token',
        token_expires_at: '2026-08-24T03:20:18.409Z', account_id: '1',
        metadata: { managerCustomerId: 'metadata-manager' }, google_credential_profile_id: 'profile-1',
      })
      .mockResolvedValueOnce({
        id: 'sync-1', coverage: 'full', coverage_reason: 'Search coverage',
        synced_at: '2026-08-24T05:00:00Z', last_attempted_at: '2026-08-24T05:00:00Z',
        last_error: null, source_total: 1, truncated_at_source: false,
      })
    mocks.dbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sync-1' }] })
      .mockResolvedValue({ rows: [] })
    mocks.queryRows.mockResolvedValue([{
      search_term: 'mornington nissan', match_type: 'EXACT', targeting_status: null,
      impressions: 10, clicks: 2, cost: 5,
    }])
    mocks.getGoogleCampaignSearchTerms.mockResolvedValue([{
      searchTerm: 'mornington nissan', matchType: 'EXACT', targetingStatus: null,
      impressions: 10, clicks: 2, cost: 5,
    }])

    const result = await syncCampaignSearchTerms(target, '2026-08-01', '2026-08-24')

    expect(result.lastError).toBeNull()
    expect(mocks.refreshGoogleAccessTokenIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: '1', google_credential_profile_id: null }),
      'conn-1',
    )
    expect(mocks.getGoogleCampaignSearchTerms).toHaveBeenCalledWith(
      '1',
      'fresh-token',
      'cloudflare-developer-token',
      '123',
      '2026-08-01',
      '2026-08-24',
      'metadata-manager',
    )
  })

  it('persists unsupported platform state without calling a provider', async () => {
    const metaTarget = { ...target, platform: 'meta' as const, campaignType: null, connectionId: 'meta-conn' }
    mocks.dbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sync-1' }] })
      .mockResolvedValueOnce({ rows: [] })
    mocks.queryOne.mockResolvedValue({
      id: 'sync-1', coverage: 'unsupported', coverage_reason: 'Search terms are available only for connected Google Ads campaigns.',
      synced_at: '2026-08-24T00:00:00Z', last_attempted_at: '2026-08-24T00:00:00Z', last_error: null,
      source_total: 0, truncated_at_source: false,
    })
    mocks.queryRows.mockResolvedValue([])
    const result = await syncCampaignSearchTerms(metaTarget, '2026-08-01', '2026-08-24')
    expect(result.coverage).toBe('unsupported')
    expect(mocks.getGoogleCampaignSearchTerms).not.toHaveBeenCalled()
  })
})
