import { beforeEach, describe, expect, it, vi } from 'vitest'

const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...args: unknown[]) => ofetchMock(...args) }))

import { getGoogleAiMaxRows } from '~~/server/utils/googleAdsClient'

beforeEach(() => ofetchMock.mockReset())

describe('getGoogleAiMaxRows', () => {
  it('fetches eligible Search campaigns and ad-group matching settings through GAQL', async () => {
    const campaignRows = [{ campaign: { id: '456', advertisingChannelType: 'SEARCH' } }]
    const adGroupRows = [{ adGroup: { id: '789', campaign: 'customers/123/campaigns/456' } }]
    ofetchMock
      .mockResolvedValueOnce([{ results: campaignRows }])
      .mockResolvedValueOnce([{ results: adGroupRows }])

    const result = await getGoogleAiMaxRows('123', 'access-token', 'developer-token', '999')

    expect(result).toEqual({ campaignRows, adGroupRows })
    expect(ofetchMock).toHaveBeenCalledTimes(2)

    const campaignRequest = ofetchMock.mock.calls[0][1]
    expect(campaignRequest.headers['login-customer-id']).toBe('999')
    expect(campaignRequest.body.query).toContain('campaign.keyword_match_type')
    expect(campaignRequest.body.query).toContain('campaign.ai_max_setting.enable_ai_max')
    expect(campaignRequest.body.query).toContain('campaign.ai_max_setting.bundling_required')
    expect(campaignRequest.body.query).toContain('campaign.asset_automation_settings')
    expect(campaignRequest.body.query).toContain("campaign.advertising_channel_type = 'SEARCH'")
    expect(campaignRequest.body.query).toContain("campaign.status IN ('ENABLED', 'PAUSED')")

    const adGroupRequest = ofetchMock.mock.calls[1][1]
    expect(adGroupRequest.body.query).toContain('ad_group.ai_max_ad_group_setting.disable_search_term_matching')
    expect(adGroupRequest.body.query).toContain("ad_group.status IN ('ENABLED', 'PAUSED')")
  })
})
