import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getGoogleAiMaxRows } from '~~/server/utils/googleAdsClient'

const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...args: unknown[]) => ofetchMock(...args) }))

beforeEach(() => ofetchMock.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('getGoogleAiMaxRows', () => {
  it('fetches eligible Search campaigns and ad-group matching settings through GAQL', async () => {
    const campaignRows = [{ campaign: { id: '456', advertisingChannelType: 'SEARCH' } }]
    const adGroupRows = [{ adGroup: { id: '789', campaign: 'customers/123/campaigns/456' } }]
    ofetchMock
      .mockResolvedValueOnce([{ results: campaignRows }])
      .mockResolvedValueOnce([{ results: adGroupRows }])

    const result = await getGoogleAiMaxRows('1234567890', 'access-token', 'developer-token', '9999999999')

    expect(result).toEqual({ campaignRows, adGroupRows })
    expect(ofetchMock).toHaveBeenCalledTimes(2)

    const campaignRequest = ofetchMock.mock.calls[0][1]
    expect(campaignRequest.headers['login-customer-id']).toBe('9999999999')
    expect(campaignRequest.body.query).toContain('campaign.keyword_match_type')
    expect(campaignRequest.body.query).toContain('campaign.ai_max_setting.enable_ai_max')
    expect(campaignRequest.body.query).toContain('campaign.ai_max_setting.bundling_required')
    expect(campaignRequest.body.query).toContain('campaign.asset_automation_settings')
    expect(campaignRequest.body.query).toContain('campaign.advertising_channel_type = \'SEARCH\'')
    expect(campaignRequest.body.query).toContain('campaign.status IN (\'ENABLED\', \'PAUSED\')')

    const adGroupRequest = ofetchMock.mock.calls[1][1]
    expect(adGroupRequest.body.query).toContain('ad_group.ai_max_ad_group_setting.disable_search_term_matching')
    expect(adGroupRequest.body.query).toContain('ad_group.status IN (\'ENABLED\', \'PAUSED\')')
  })

  it('redacts customer identifiers from GAQL permission diagnostics', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    ofetchMock.mockRejectedValueOnce({
      status: 403,
      data: { error: { details: [{ errors: [{ errorCode: { authorizationError: 'USER_PERMISSION_DENIED' } }] }] } }
    })

    await expect(getGoogleAiMaxRows(
      '1234567890',
      'access-token',
      'developer-token',
      '9999999999'
    )).rejects.toBeTruthy()

    const diagnostics = consoleError.mock.calls.flat().join(' ')
    expect(diagnostics).toContain('customer [REDACTED]')
    expect(diagnostics).not.toContain('1234567890')
    expect(diagnostics).not.toContain('9999999999')
  })

  it('does not replace the provider error when diagnostic data cannot be serialized', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const diagnosticData: Record<string, unknown> = {}
    diagnosticData.circular = diagnosticData
    const providerError = { status: 403, data: diagnosticData }
    ofetchMock.mockRejectedValueOnce(providerError)

    await expect(getGoogleAiMaxRows(
      '1234567890',
      'access-token',
      'developer-token'
    )).rejects.toBe(providerError)
  })
})
