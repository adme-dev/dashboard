import { describe, expect, it, vi } from 'vitest'

const mockSyncGa4 = vi.fn(async () => ({
  propertiesSynced: 1,
  rowsUpserted: 1,
  errors: []
}))
const mockSyncGa4Dimensions = vi.fn(async () => ({
  propertiesSynced: 1,
  dimensionRowsUpserted: 1,
  eventRowsUpserted: 1,
  throttled: false,
  errors: []
}))
const oauthConfig = {
  googleClientId: 'runtime-client-id',
  googleClientSecret: 'runtime-client-secret'
}
const mockResolveGoogleOAuthRuntimeConfig = vi.fn(() => ({
  ...oauthConfig,
  googleRedirectUri: '/api/agency/social/google/callback',
  ga4RedirectUri: '/api/agency/social/ga4/callback'
}))

vi.mock('~~/server/utils/ga4Sync', () => ({
  syncGa4: (options: unknown) => mockSyncGa4(options)
}))

vi.mock('~~/server/utils/ga4DimensionSync', () => ({
  syncGa4Dimensions: (options: unknown) => mockSyncGa4Dimensions(options)
}))

vi.mock('~~/server/utils/googleOAuthRuntimeConfig', () => ({
  resolveGoogleOAuthRuntimeConfig: (event: unknown) => mockResolveGoogleOAuthRuntimeConfig(event)
}))

const { default: handler } = await import('../../../server/api/cron/ga4-sync.post')
const { default: dimensionsHandler } = await import('../../../server/api/cron/ga4-dimensions.post')

function cloudflareEvent() {
  return {
    node: {
      req: { headers: {} }
    },
    context: {
      cloudflare: {
        env: {
          GOOGLE_CLIENT_ID: oauthConfig.googleClientId,
          GOOGLE_CLIENT_SECRET: oauthConfig.googleClientSecret
        }
      }
    }
  }
}

describe('POST /api/cron/ga4-sync runtime OAuth config', () => {
  it('passes per-request Cloudflare Google credentials into the background sync', async () => {
    const event = cloudflareEvent()

    await handler(event as Parameters<typeof handler>[0])

    expect(mockResolveGoogleOAuthRuntimeConfig).toHaveBeenCalledWith(event)
    expect(mockSyncGa4).toHaveBeenCalledWith({
      lookbackDays: 14,
      oauthConfig
    })
  })

  it('passes the same runtime credentials into the dimension sync', async () => {
    const event = cloudflareEvent()

    await dimensionsHandler(event as Parameters<typeof dimensionsHandler>[0])

    expect(mockResolveGoogleOAuthRuntimeConfig).toHaveBeenCalledWith(event)
    expect(mockSyncGa4Dimensions).toHaveBeenCalledWith({
      lookbackDays: 14,
      oauthConfig
    })
  })
})
