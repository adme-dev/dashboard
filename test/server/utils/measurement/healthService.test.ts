import { describe, expect, it, vi } from 'vitest'
import type {
  MeasurementHealthRepository
} from '../../../../server/utils/measurement/healthRepository'
import { createMeasurementHealthService } from '../../../../server/utils/measurement/healthService'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const DESTINATION_ID = '55555555-5555-4555-8555-555555555555'

function input() {
  return {
    clientId: CLIENT_ID,
    destinationId: DESTINATION_ID,
    expectedConfigVersion: 3,
    observedAt: '2026-07-17T05:30:00.000Z',
    actor: { type: 'system' as const, id: 'measurement-meta-validator' },
    reason: 'Meta test-event validation completed',
    providerRequestId: 'request-redacted-123',
    capabilities: [{
      mode: 'meta_crm_capi' as const,
      status: 'ready' as const,
      blockingReason: null
    }]
  }
}

function harness(status: 'recorded' | 'not_found' | 'invalid_capability' | 'version_conflict' = 'recorded') {
  const repository: MeasurementHealthRepository = {
    recordValidation: vi.fn(async () => {
      if (status === 'recorded') {
        return {
          status: 'recorded' as const,
          evidence: {
            clientId: CLIENT_ID,
            destinationId: DESTINATION_ID,
            configVersion: 3,
            healthStatus: 'ready' as const,
            observedAt: input().observedAt,
            capabilities: input().capabilities
          }
        }
      }
      if (status === 'version_conflict') {
        return { status: 'version_conflict' as const, currentVersion: 4 }
      }
      return { status }
    })
  }
  return { repository, service: createMeasurementHealthService({ repository }) }
}

describe('Measurement health service', () => {
  it('accepts strict system evidence and returns the canonical derived health state', async () => {
    const test = harness()

    await expect(test.service.recordValidation(input())).resolves.toEqual(expect.objectContaining({
      configVersion: 3,
      healthStatus: 'ready'
    }))
    expect(test.repository.recordValidation).toHaveBeenCalledWith(expect.objectContaining({
      actor: { type: 'system', id: 'measurement-meta-validator' },
      errorClass: null,
      redactedError: null
    }))
  })

  it('rejects raw provider payloads before persistence', async () => {
    const test = harness()

    await expect(test.service.recordValidation({
      ...input(),
      providerResponse: { access_token: 'must-not-reach-persistence' }
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR', statusCode: 422 })
    expect(test.repository.recordValidation).not.toHaveBeenCalled()
  })

  it.each([
    ['not_found', 'MEASUREMENT_NOT_FOUND', 404],
    ['invalid_capability', 'MEASUREMENT_VALIDATION_ERROR', 422],
    ['version_conflict', 'MEASUREMENT_VERSION_CONFLICT', 409]
  ] as const)('maps repository %s to a stable redacted error', async (status, code, statusCode) => {
    const test = harness(status)

    await expect(test.service.recordValidation(input())).rejects.toMatchObject({ code, statusCode })
  })
})
