import { describe, expect, it } from 'vitest'
import {
  classifyAiMaxReadiness,
  normalizeGoogleAiMaxObservation,
  type GoogleAiMaxObservation,
} from '~~/server/utils/googleAiMax'

function observation(overrides: Partial<GoogleAiMaxObservation> = {}): GoogleAiMaxObservation {
  return {
    apiVersion: 'v23',
    tenantId: 'tenant-a',
    connectionId: 'connection-a',
    customerId: 'customer-a',
    campaignId: 'campaign-a',
    campaignName: 'Search campaign',
    campaignStatus: 'ENABLED',
    advertisingChannelType: 'SEARCH',
    biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
    keywordMatchType: 'UNSPECIFIED',
    aiMaxEnabled: false,
    bundlingRequired: 'NOT_REQUIRED',
    textAssetAutomationStatus: 'OPTED_OUT',
    finalUrlExpansionStatus: 'OPTED_OUT',
    adGroupCount: 2,
    searchTermMatchingDisabledAdGroupCount: 0,
    observedAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  }
}

describe('classifyAiMaxReadiness', () => {
  it('classifies text asset automation as an ACA migration trigger', () => {
    const result = classifyAiMaxReadiness(observation({
      textAssetAutomationStatus: 'OPTED_IN',
    }))

    expect(result.migrationReason).toBe('aca')
    expect(result.status).toBe('scheduled_upgrade')
    expect(result.risks).toContain('AUTO_UPGRADE_PENDING')
  })

  it('classifies campaign-level BROAD keyword matching as a migration trigger', () => {
    const result = classifyAiMaxReadiness(observation({ keywordMatchType: 'BROAD' }))

    expect(result.migrationReason).toBe('campaign_broad_match')
    expect(result.status).toBe('scheduled_upgrade')
  })

  it('preserves both direct migration triggers', () => {
    const result = classifyAiMaxReadiness(observation({
      keywordMatchType: 'BROAD',
      textAssetAutomationStatus: 'OPTED_IN',
    }))

    expect(result.migrationReason).toBe('aca_and_campaign_broad_match')
  })

  it('fails closed when required provider evidence is missing', () => {
    const result = classifyAiMaxReadiness(observation({ keywordMatchType: null }))

    expect(result.migrationReason).toBe('unknown')
    expect(result.status).toBe('unknown')
    expect(result.risks).toContain('UNKNOWN_CONFIGURATION')
  })

  it('does not infer final URL expansion from AI Max or text customisation', () => {
    const result = classifyAiMaxReadiness(observation({
      aiMaxEnabled: true,
      textAssetAutomationStatus: 'OPTED_IN',
      finalUrlExpansionStatus: 'OPTED_OUT',
    }))

    expect(result.effectiveSettings.finalUrlExpansion).toBe('disabled')
    expect(result.effectiveSettings.textCustomisation).toBe('enabled')
  })

  it('reports partially disabled search-term matching at ad-group level', () => {
    const result = classifyAiMaxReadiness(observation({
      aiMaxEnabled: true,
      adGroupCount: 3,
      searchTermMatchingDisabledAdGroupCount: 1,
    }))

    expect(result.effectiveSettings.searchTermMatching).toBe('partially_disabled')
    expect(result.status).toBe('needs_review')
    expect(result.risks).toContain('PARTIAL_SEARCH_MATCHING')
  })
})

describe('normalizeGoogleAiMaxObservation', () => {
  it('normalizes Google REST campaign settings and matching exceptions without inference', () => {
    const result = normalizeGoogleAiMaxObservation({
      apiVersion: 'v23',
      tenantId: 'tenant-a',
      connectionId: 'connection-a',
      customerId: '1234567890',
      observedAt: '2026-08-06T01:00:00.000Z',
      campaignRow: {
        campaign: {
          id: '456',
          name: 'Search - Generic',
          status: 'ENABLED',
          advertisingChannelType: 'SEARCH',
          biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
          keywordMatchType: 'BROAD',
          aiMaxSetting: {
            enableAiMax: true,
            bundlingRequired: 'REQUIRED',
          },
          assetAutomationSettings: [
            {
              assetAutomationType: 'TEXT_ASSET_AUTOMATION',
              assetAutomationStatus: 'OPTED_IN',
            },
            {
              assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION',
              assetAutomationStatus: 'OPTED_OUT',
            },
          ],
        },
      },
      adGroupRows: [
        {
          adGroup: {
            id: '1',
            campaign: 'customers/1234567890/campaigns/456',
            status: 'ENABLED',
            aiMaxAdGroupSetting: { disableSearchTermMatching: false },
          },
        },
        {
          adGroup: {
            id: '2',
            campaign: 'customers/1234567890/campaigns/456',
            status: 'PAUSED',
            aiMaxAdGroupSetting: { disableSearchTermMatching: true },
          },
        },
        {
          adGroup: {
            id: '3',
            campaign: 'customers/1234567890/campaigns/999',
            status: 'ENABLED',
            aiMaxAdGroupSetting: { disableSearchTermMatching: true },
          },
        },
      ],
    })

    expect(result).toEqual({
      apiVersion: 'v23',
      tenantId: 'tenant-a',
      connectionId: 'connection-a',
      customerId: '1234567890',
      campaignId: '456',
      campaignName: 'Search - Generic',
      campaignStatus: 'ENABLED',
      advertisingChannelType: 'SEARCH',
      biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
      keywordMatchType: 'BROAD',
      aiMaxEnabled: true,
      bundlingRequired: 'REQUIRED',
      textAssetAutomationStatus: 'OPTED_IN',
      finalUrlExpansionStatus: 'OPTED_OUT',
      adGroupCount: 2,
      searchTermMatchingDisabledAdGroupCount: 1,
      observedAt: '2026-08-06T01:00:00.000Z',
    })
  })
})
