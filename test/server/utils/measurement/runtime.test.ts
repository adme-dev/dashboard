import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateProviderTestService,
  mockHealthRecordValidation,
  mockCreateHealthService
} = vi.hoisted(() => {
  const mockHealthRecordValidation = vi.fn(async () => ({ healthStatus: 'ready' }))
  return {
    mockCreateProviderTestService: vi.fn(() => ({ run: vi.fn() })),
    mockHealthRecordValidation,
    mockCreateHealthService: vi.fn(() => ({ recordValidation: mockHealthRecordValidation }))
  }
})

vi.mock('~~/server/utils/measurement/providerTestService', () => ({
  createMeasurementProviderTestService: mockCreateProviderTestService
}))

vi.mock('~~/server/utils/measurement/healthService', () => ({
  createMeasurementHealthService: mockCreateHealthService
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
      googleClientSecret: 'request-client-secret'
    }))
  })

  it('strips directlyExercised/inferred before calling the health service and folds them into reason', async () => {
    const event = { context: { cloudflare: { env: {} } } }

    const { createMeasurementProviderTestRuntime } = await import(
      '~~/server/utils/measurement/runtime'
    )
    createMeasurementProviderTestRuntime(
      event as Parameters<typeof createMeasurementProviderTestRuntime>[0]
    )

    const dependencies = mockCreateProviderTestService.mock.calls[0]?.[0]
    await dependencies.recordValidation({
      clientId: 'client-1',
      destinationId: 'destination-1',
      reason: 'Approved controlled-pilot validation',
      directlyExercised: ['meta_crm_capi', 'meta_conversion_leads'],
      inferred: ['meta_web_capi']
    })

    expect(mockHealthRecordValidation).toHaveBeenCalledOnce()
    const evidenceSentToHealthService = mockHealthRecordValidation.mock.calls[0][0]
    expect(evidenceSentToHealthService).not.toHaveProperty('directlyExercised')
    expect(evidenceSentToHealthService).not.toHaveProperty('inferred')
    expect(evidenceSentToHealthService.reason).toBe(
      'Approved controlled-pilot validation '
      + '[directly exercised: meta_crm_capi, meta_conversion_leads] '
      + '[inferred: meta_web_capi]'
    )
  })
})
