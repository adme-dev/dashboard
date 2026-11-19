import { describe, expect, it } from 'vitest'
import { normalizeGoogleAdsError } from '~~/server/utils/googleAds/errors'

const failure = (message: string) => ({
  error: {
    code: 400,
    status: 'INVALID_ARGUMENT',
    details: [{ '@type': 'type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure', errors: [{ errorCode: { queryError: 'PROHIBITED_FIELD_IN_SELECT_CLAUSE' }, message }] }]
  }
})

describe('Google Ads error envelopes', () => {
  it('reads the provider error code from a searchStream array envelope', () => {
    const err = normalizeGoogleAdsError({ status: 400, data: [failure("Field 'recommendation.forecasting_campaign_budget_recommendation' cannot be selected.")] })
    expect(err.code).toBe('PROHIBITED_FIELD_IN_SELECT_CLAUSE')
    expect(err.fieldPath).toBe('recommendation.forecasting_campaign_budget_recommendation')
    expect(err.safeMessage).toBe('Google Ads rejected the requested fields.')
  })

  it('still reads unary envelopes and never lifts free text', () => {
    const err = normalizeGoogleAdsError({ status: 400, response: { _data: failure('Something about a customer named Bob Smith') } })
    expect(err.code).toBe('PROHIBITED_FIELD_IN_SELECT_CLAUSE')
    expect(err.fieldPath).toBeUndefined()
  })
})
