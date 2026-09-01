import { describe, expect, it } from 'vitest'
import {
  GoogleAdsActionError,
  isGoogleAdsRetryable,
  normalizeGoogleAdsError
} from '~~/server/utils/googleAds/errors'

describe('normalizeGoogleAdsError', () => {
  it('returns a safe field error with the provider request ID', () => {
    const normalized = normalizeGoogleAdsError({
      status: 400,
      response: { headers: new Headers({ 'request-id': 'req-1' }) },
      data: {
        error: {
          details: [{
            errors: [{
              errorCode: { fieldError: 'REQUIRED' },
              message: 'Required field missing',
              location: {
                fieldPathElements: [
                  { fieldName: 'operations', index: 2 },
                  { fieldName: 'create' },
                  { fieldName: 'campaign' },
                  { fieldName: 'name' }
                ]
              }
            }]
          }]
        }
      }
    })

    expect(normalized).toMatchObject({
      code: 'REQUIRED',
      category: 'validation',
      retryable: false,
      operationIndex: 2,
      fieldPath: 'operations[2].create.campaign.name',
      requestId: 'req-1',
      safeMessage: 'Google Ads rejected the requested fields.'
    })
  })

  it('never copies credentials or the raw provider body', () => {
    const normalized = normalizeGoogleAdsError({
      status: 401,
      message: 'Bearer secret-access-token was rejected',
      data: {
        access_token: 'secret-access-token',
        developer_token: 'secret-developer-token',
        error: { message: 'denied: secret-access-token' }
      }
    })

    expect(normalized).toMatchObject({
      code: 'AUTHENTICATION_ERROR',
      category: 'auth',
      retryable: false,
      safeMessage: 'Google Ads authentication failed.'
    })
    expect(JSON.stringify(normalized)).not.toContain('secret-access-token')
    expect(JSON.stringify(normalized)).not.toContain('secret-developer-token')
  })

  it.each([
    [403, 'PERMISSION_DENIED', 'permission', false],
    [409, 'CONFLICT', 'conflict', false],
    [429, 'RESOURCE_EXHAUSTED', 'quota', true],
    [503, 'UNAVAILABLE', 'provider', true]
  ] as const)('maps HTTP %s to a stable %s error', (status, code, category, retryable) => {
    expect(normalizeGoogleAdsError({ status })).toMatchObject({ code, category, retryable })
  })

  it('returns an existing normalized error unchanged', () => {
    const error = new GoogleAdsActionError({
      code: 'UNAVAILABLE',
      category: 'provider',
      retryable: true,
      safeMessage: 'Google Ads is temporarily unavailable.'
    })

    expect(normalizeGoogleAdsError(error)).toBe(error)
    expect(isGoogleAdsRetryable(error)).toBe(true)
  })
})
