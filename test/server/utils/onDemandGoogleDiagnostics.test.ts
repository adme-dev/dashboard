import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  resolveCredential: vi.fn(),
  resolveConfig: vi.fn(),
  refreshToken: vi.fn(),
  getDiagnostics: vi.fn(),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  execute: (...args: unknown[]) => mocks.execute(...args),
}))
vi.mock('~~/server/utils/googleCredentialProfiles', () => ({
  GOOGLE_CREDENTIAL_PROFILE_JOIN: 'LEFT JOIN google_credential_profiles gcp ON FALSE',
  GOOGLE_CREDENTIAL_PROFILE_SELECT: 'NULL AS google_credential_profile_id',
  persistGoogleCredentialRefresh: vi.fn(),
  resolveGoogleCredential: (...args: unknown[]) => mocks.resolveCredential(...args),
}))
vi.mock('~~/server/utils/spendSync', () => ({
  resolveGoogleAdsRuntimeConfig: (...args: unknown[]) => mocks.resolveConfig(...args),
}))
vi.mock('~~/server/utils/googleAdsClient', () => ({
  refreshGoogleToken: (...args: unknown[]) => mocks.refreshToken(...args),
  getGoogleCampaignDiagnostics: (...args: unknown[]) => mocks.getDiagnostics(...args),
}))

import { syncCampaignDeliveryDiagnostics } from '~~/server/utils/onDemandSync'

describe('syncCampaignDeliveryDiagnostics Google credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryOne
      .mockResolvedValueOnce({
        id: 'spend-1',
        platform: 'google_ads',
        campaign_id: '23140875768',
        connection_id: 'connection-1',
        period: '2026-08',
      })
      .mockResolvedValueOnce({
        id: 'connection-1',
        access_token: 'legacy-token',
        account_id: '5340680223',
        metadata: { managerCustomerId: '5250473322' },
        refresh_token: 'refresh-token',
        token_expires_at: '2026-08-24T00:00:00.000Z',
      })
    mocks.resolveCredential.mockResolvedValue({
      accessToken: 'profile-access-token',
      refreshToken: 'profile-refresh-token',
      tokenExpiresAt: '2099-08-24T00:00:00.000Z',
      profileId: 'profile-1',
      source: 'profile',
    })
    mocks.resolveConfig.mockReturnValue({
      googleClientId: 'cloudflare-client-id',
      googleClientSecret: 'cloudflare-client-secret',
      googleDeveloperToken: 'cloudflare-developer-token',
      googleAdsLoginCustomerId: '9999999999',
    })
    mocks.getDiagnostics.mockResolvedValue([{
      servingStatus: 'active',
      servingStatusReasons: [],
      providerServingStatusReasons: [],
      servingSyncedAt: '2026-08-24T04:00:00.000Z',
      servingUnavailableReason: null,
      impressionShare: 0.4,
      lostImpressionShareBudget: 0.2,
      lostImpressionShareRank: 0.1,
      impressionShareSyncedAt: '2026-08-24T04:00:00.000Z',
      impressionShareUnavailableReason: null,
    }])
    mocks.execute.mockResolvedValue(undefined)
  })

  it('uses the hydrated profile token and Cloudflare-aware Ads config', async () => {
    await expect(syncCampaignDeliveryDiagnostics('spend-1')).resolves.toMatchObject({
      available: true,
      platform: 'google',
      servingSynced: true,
      impressionShareSynced: true,
      error: null,
    })

    expect(mocks.refreshToken).not.toHaveBeenCalled()
    expect(mocks.getDiagnostics).toHaveBeenCalledWith(
      '5340680223',
      'profile-access-token',
      'cloudflare-developer-token',
      '2026-08-01',
      '2026-08-31',
      '23140875768',
      '5250473322',
    )
  })
})
