import { describe, expect, it } from 'vitest'
import { scanGoogleAiMaxAccount } from '~~/server/utils/googleAiMaxScanner'

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
