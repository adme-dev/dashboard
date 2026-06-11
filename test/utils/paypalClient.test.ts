import { describe, expect, it, vi } from 'vitest'
import {
  exchangePayPalClientCredentials,
  getPayPalEndpoints,
  resolvePayPalConfig,
} from '../../server/utils/paypalClient'

describe('paypalClient', () => {
  it('reports missing configuration without exposing secrets', () => {
    const cfg = resolvePayPalConfig({
      paypalClientId: '',
      paypalClientSecret: '',
      paypalEnvironment: 'sandbox',
    })

    expect(cfg.configured).toBe(false)
    expect(cfg.environment).toBe('sandbox')
    expect(cfg.clientId).toBe('')
    expect(cfg.clientSecret).toBe('')
    expect(cfg.endpoints.apiBaseUrl).toBe('https://api-m.sandbox.paypal.com')
  })

  it('uses live PayPal endpoints when PAYPAL_ENVIRONMENT is live', () => {
    const endpoints = getPayPalEndpoints('live')

    expect(endpoints.apiBaseUrl).toBe('https://api-m.paypal.com')
    expect(endpoints.tokenUrl).toBe('https://api-m.paypal.com/v1/oauth2/token')
  })

  it('exchanges client credentials for token metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scope: 'openid https://uri.paypal.com/services/invoicing',
        access_token: 'secret-token',
        token_type: 'Bearer',
        app_id: 'APP-123',
        expires_in: 28800,
      }),
    })

    const result = await exchangePayPalClientCredentials({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      environment: 'sandbox',
      endpoints: getPayPalEndpoints('sandbox'),
      now: new Date('2026-06-11T00:00:00.000Z'),
      fetcher,
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api-m.sandbox.paypal.com/v1/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        body: 'grant_type=client_credentials',
      })
    )
    expect(result).toMatchObject({
      accessToken: 'secret-token',
      tokenType: 'Bearer',
      appId: 'APP-123',
      scopes: ['openid', 'https://uri.paypal.com/services/invoicing'],
      tokenExpiresAt: '2026-06-11T08:00:00.000Z',
    })
  })

  it('throws a clean error when PayPal rejects credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_client"}',
    })

    await expect(exchangePayPalClientCredentials({
      clientId: 'bad',
      clientSecret: 'bad-secret',
      environment: 'sandbox',
      endpoints: getPayPalEndpoints('sandbox'),
      now: new Date('2026-06-11T00:00:00.000Z'),
      fetcher,
    })).rejects.toThrow('PayPal token request failed with 401')
  })
})
