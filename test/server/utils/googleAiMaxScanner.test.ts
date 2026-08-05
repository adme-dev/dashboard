import { describe, expect, it, vi } from 'vitest'
import { buildGoogleAiMaxState, type GoogleAiMaxObservation } from '~~/server/utils/googleAiMax'
import {
  runGoogleAiMaxPortfolioScan,
  scanGoogleAiMaxAccount,
} from '~~/server/utils/googleAiMaxScanner'

function state(overrides: Partial<GoogleAiMaxObservation> = {}) {
  return buildGoogleAiMaxState({
    apiVersion: 'v23',
    tenantId: 'tenant-a',
    connectionId: 'connection-a',
    customerId: '123',
    campaignId: '456',
    campaignName: 'Search campaign',
    campaignStatus: 'ENABLED',
    advertisingChannelType: 'SEARCH',
    biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
    keywordMatchType: 'BROAD',
    aiMaxEnabled: false,
    bundlingRequired: 'NOT_REQUIRED',
    textAssetAutomationStatus: 'OPTED_OUT',
    finalUrlExpansionStatus: 'OPTED_OUT',
    adGroupCount: 1,
    searchTermMatchingDisabledAdGroupCount: 0,
    observedAt: '2026-08-06T02:00:00.000Z',
    ...overrides,
  })
}

describe('scanGoogleAiMaxAccount', () => {
  it('returns classified state for each Search campaign from one account fetch', async () => {
    const result = await scanGoogleAiMaxAccount({
      tenantId: 'tenant-a',
      connectionId: 'connection-a',
      customerId: '123',
      accessToken: 'access-token',
      developerToken: 'developer-token',
      loginCustomerId: '999',
      observedAt: '2026-08-06T02:00:00.000Z',
    }, {
      fetchRows: async () => ({
        campaignRows: [
          {
            campaign: {
              id: '456',
              name: 'ACA campaign',
              status: 'ENABLED',
              advertisingChannelType: 'SEARCH',
              biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
              keywordMatchType: 'UNSPECIFIED',
              aiMaxSetting: { enableAiMax: false, bundlingRequired: 'NOT_REQUIRED' },
              assetAutomationSettings: [
                { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_IN' },
                { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
              ],
            },
          },
          {
            campaign: {
              id: '789',
              name: 'Unaffected campaign',
              status: 'PAUSED',
              advertisingChannelType: 'SEARCH',
              biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
              keywordMatchType: 'UNSPECIFIED',
              aiMaxSetting: { enableAiMax: false, bundlingRequired: 'NOT_REQUIRED' },
              assetAutomationSettings: [
                { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
                { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
              ],
            },
          },
        ],
        adGroupRows: [
          {
            adGroup: {
              id: '1',
              campaign: 'customers/123/campaigns/456',
              status: 'ENABLED',
              aiMaxAdGroupSetting: { disableSearchTermMatching: false },
            },
          },
          {
            adGroup: {
              id: '2',
              campaign: 'customers/123/campaigns/789',
              status: 'ENABLED',
              aiMaxAdGroupSetting: { disableSearchTermMatching: false },
            },
          },
        ],
      }),
    })

    expect(result.map(state => ({
      campaignId: state.campaignId,
      migrationReason: state.migrationReason,
      readinessStatus: state.readinessStatus,
    }))).toEqual([
      { campaignId: '456', migrationReason: 'aca', readinessStatus: 'scheduled_upgrade' },
      { campaignId: '789', migrationReason: 'none', readinessStatus: 'not_affected' },
    ])
  })
})

describe('runGoogleAiMaxPortfolioScan', () => {
  it('retains one successful account and finishes partial when another account fails', async () => {
    const persistStates = vi.fn(async () => ({
      inserted: 1,
      refreshed: 0,
      changed: 0,
      events: [],
    }))
    const finishRun = vi.fn(async input => ({ id: input.runId, status: 'partial' as const }))

    const result = await runGoogleAiMaxPortfolioScan({
      tenantId: 'tenant-a',
      trigger: 'manual',
      requestedBy: 'user-a',
      developerToken: 'developer-token',
      observedAt: '2026-08-06T02:00:00.000Z',
      accounts: [
        { connectionId: 'connection-a', customerId: '123', accessToken: 'token-a' },
        { connectionId: 'connection-b', customerId: '789', accessToken: 'token-b' },
      ],
    }, {
      claimRun: async () => ({ id: 'run-1', status: 'queued' }),
      markRunning: async () => true,
      scanAccount: async account => {
        if (account.connectionId === 'connection-b') {
          throw new Error('Google access denied for token-b')
        }
        return [state()]
      },
      persistStates,
      finishRun,
    })

    expect(result).toMatchObject({
      accepted: true,
      run: { id: 'run-1', status: 'partial' },
      processedConnections: 1,
      totalCampaigns: 1,
      affectedCampaigns: 1,
      unknownCampaigns: 0,
      failures: [{
        connectionId: 'connection-b',
        customerId: '789',
        error: 'Google access denied for [REDACTED]',
      }],
    })
    expect(persistStates).toHaveBeenCalledTimes(1)
    expect(finishRun).toHaveBeenCalledWith(expect.objectContaining({
      processedConnections: 1,
      failures: [expect.objectContaining({ connectionId: 'connection-b' })],
    }))
  })

  it('does no provider work when the tenant already has an active run', async () => {
    const scanAccount = vi.fn()

    const result = await runGoogleAiMaxPortfolioScan({
      tenantId: 'tenant-a',
      trigger: 'scheduled',
      developerToken: 'developer-token',
      observedAt: '2026-08-06T02:00:00.000Z',
      accounts: [
        { connectionId: 'connection-a', customerId: '123', accessToken: 'token-a' },
      ],
    }, {
      claimRun: async () => null,
      markRunning: async () => true,
      scanAccount,
      persistStates: vi.fn(),
      finishRun: vi.fn(),
    })

    expect(result).toEqual({ accepted: false, run: null })
    expect(scanAccount).not.toHaveBeenCalled()
  })
})
