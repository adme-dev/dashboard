import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateProviderTestService } = vi.hoisted(() => ({
  mockCreateProviderTestService: vi.fn(() => ({ run: vi.fn() }))
}))

vi.mock('~~/server/utils/measurement/providerTestService', () => ({
  createMeasurementProviderTestService: mockCreateProviderTestService
}))

describe('createMeasurementProviderTestRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
      googleClientId: '',
      googleClientSecret: '',
      metaGraphApiVersion: 'v25.0'
    })))
  })

  it('uses per-request Cloudflare bindings for Google provider validation', async () => {
    const event = {
      context: {
        cloudflare: {
          env: {
            GOOGLE_CLIENT_ID: 'request-client-id',
            GOOGLE_CLIENT_SECRET: 'request-client-secret'
          }
        }
      }
    }

    const { createMeasurementProviderTestRuntime } = await import(
      '~~/server/utils/measurement/runtime'
    )
    createMeasurementProviderTestRuntime(
      event as Parameters<typeof createMeasurementProviderTestRuntime>[0]
    )

    const dependencies = mockCreateProviderTestService.mock.calls[0]?.[0]
    expect(dependencies).toEqual(expect.objectContaining({
      googleClientId: 'request-client-id',
      googleClientSecret: 'request-client-secret',
      deliverTikTok: expect.any(Function)
    }))
  })
})
