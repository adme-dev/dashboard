import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import type { GooglePmaxRemoteProviderError } from '~~/server/utils/googlePmaxRemoteProvider'
import { createGooglePmaxRemoteProvider } from '~~/server/utils/googlePmaxRemoteProvider'

const config = {
  customerId: '1234567890',
  connectionId: 'connection-1'
} as GooglePmaxInventoryLaunchConfig

const connection = {
  id: 'connection-1', clientId: 'client-1', status: 'active' as const,
  customerId: '1234567890', accessToken: 'access-secret', developerToken: 'developer-secret'
}

const resources = {
  customerId: '1234567890',
  campaignResourceName: 'customers/1234567890/campaigns/101',
  campaignId: '101',
  budgetResourceName: 'customers/1234567890/campaignBudgets/102',
  assetGroupResourceName: 'customers/1234567890/assetGroups/103',
  status: 'PAUSED' as const,
  requestId: 'request-1'
}

describe('Google PMax private provider client', () => {
  it('uses the Cloudflare service binding and carries credentials only in the private request', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, result: resources }))
    const event = {
      context: { cloudflare: { env: { GOOGLE_PMAX_PROVIDER: { fetch } } } }
    } as unknown as H3Event
    const provider = createGooglePmaxRemoteProvider(event, {
      loadConnection: vi.fn().mockResolvedValue(connection)
    })

    await expect(provider.createPaused(config)).resolves.toEqual(resources)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://google-pmax-provider.internal/v1/execute')
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-xeroflow-service': 'google-pmax-provider-v1'
    })
    expect(JSON.parse(init.body)).toMatchObject({
      action: 'create_paused',
      connection: { accessToken: 'access-secret', developerToken: 'developer-secret' }
    })
  })

  it('fails closed when the service binding is absent or returns malformed data', async () => {
    const loadConnection = vi.fn().mockResolvedValue(connection)
    const unavailable = createGooglePmaxRemoteProvider({ context: {} } as H3Event, { loadConnection })
    await expect(unavailable.createPaused(config)).rejects.toMatchObject<Partial<GooglePmaxRemoteProviderError>>({
      code: 'PMAX_PROVIDER_SERVICE_UNAVAILABLE'
    })

    const malformed = createGooglePmaxRemoteProvider({ context: {} } as H3Event, {
      loadConnection,
      binding: { fetch: vi.fn().mockResolvedValue(Response.json({ ok: true, result: { status: 'PAUSED' } })) }
    })
    await expect(malformed.createPaused(config)).rejects.toMatchObject<Partial<GooglePmaxRemoteProviderError>>({
      code: 'PMAX_PROVIDER_SERVICE_RESPONSE_INVALID'
    })
  })
})
