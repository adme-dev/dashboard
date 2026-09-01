import { describe, expect, it, vi } from 'vitest'
import {
  buildGoogleAdsHeaders,
  googleAdsRequest
} from '~~/server/utils/googleAds/api'

const auth = {
  accessToken: 'access',
  developerToken: 'developer',
  loginCustomerId: '123-456-7890'
}

describe('buildGoogleAdsHeaders', () => {
  it('normalizes the manager customer ID and includes required credentials', () => {
    expect(buildGoogleAdsHeaders(auth)).toEqual({
      'Authorization': 'Bearer access',
      'developer-token': 'developer',
      'login-customer-id': '1234567890',
      'Content-Type': 'application/json'
    })
  })

  it('rejects a malformed manager customer ID', () => {
    expect(() => buildGoogleAdsHeaders({ ...auth, loginCustomerId: 'not-an-id' }))
      .toThrow('Invalid Google Ads login customer ID')
  })
})

describe('googleAdsRequest', () => {
  it('calls a v25 path and returns parsed data without credentials', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })

    const result = await googleAdsRequest({
      path: '/customers:listAccessibleCustomers',
      method: 'GET',
      auth
    }, { fetch, sleep: vi.fn() })

    expect(fetch).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v25/customers:listAccessibleCustomers',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer access',
          'developer-token': 'developer',
          'login-customer-id': '1234567890'
        })
      })
    )
    expect(result).toEqual({ data: { ok: true }, requestId: undefined })
    expect(JSON.stringify(result)).not.toContain('access')
    expect(JSON.stringify(result)).not.toContain('developer')
  })

  it('returns a request ID from a raw ofetch response', async () => {
    const fetch = vi.fn().mockResolvedValue({
      _data: { results: [] },
      headers: new Headers({ 'request-id': 'req-25' })
    })

    await expect(googleAdsRequest({ path: '/x', method: 'GET', auth }, { fetch, sleep: vi.fn() }))
      .resolves.toEqual({ data: { results: [] }, requestId: 'req-25' })
  })

  it('retries a retryable read with bounded backoff', async () => {
    const unavailable = Object.assign(new Error('unavailable'), { status: 503 })
    const fetch = vi.fn()
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValue({ ok: true })
    const sleep = vi.fn().mockResolvedValue(undefined)

    await googleAdsRequest({ path: '/x', method: 'POST', auth, body: {}, retries: 1 }, { fetch, sleep })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(250)
  })

  it('never retries an ambiguous write', async () => {
    const unavailable = Object.assign(new Error('unavailable'), { status: 503 })
    const fetch = vi.fn().mockRejectedValue(unavailable)
    const sleep = vi.fn()

    await expect(googleAdsRequest({
      path: '/x:mutate',
      method: 'POST',
      auth,
      body: {},
      retries: 3,
      write: true
    }, { fetch, sleep })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      category: 'provider',
      retryable: true
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
