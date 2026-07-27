import { describe, expect, it, vi } from 'vitest'
import { createMeasurementAttestationService } from '~~/server/utils/measurement/attestationService'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const DESTINATION_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '44444444-4444-4444-8444-444444444444'

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    destinationId: DESTINATION_ID,
    expectedConfigVersion: 1,
    capabilities: [{ mode: 'meta_pixel', status: 'ready', blockingReason: null }],
    reason: 'Confirmed the pixel fires on the client site',
    confirmed: true,
    actor: { id: ACTOR_ID },
    ...overrides
  }
}

function harness(options: { destination?: { enabled: boolean, environment: string } } = {}) {
  const recordValidation = vi.fn().mockResolvedValue({ healthStatus: 'ready' })
  const readDestination = vi.fn().mockResolvedValue(
    options.destination ?? { enabled: false, environment: 'test' }
  )
  const service = createMeasurementAttestationService({
    healthService: { recordValidation },
    readDestination,
    now: () => new Date('2026-07-27T00:00:00.000Z')
  })
  return { service, recordValidation, readDestination }
}

describe('measurement attestation service', () => {
  it('records attested evidence with a user actor', async () => {
    const { service, recordValidation } = harness()
    await service.attest(buildInput())
    expect(recordValidation).toHaveBeenCalledOnce()
    expect(recordValidation.mock.calls[0][0].actor).toEqual({ type: 'team_member', id: ACTOR_ID })
  })

  it('rejects attesting a capability a provider test already covers', async () => {
    const { service } = harness()
    await expect(service.attest(buildInput({
      capabilities: [{ mode: 'meta_crm_capi', status: 'ready', blockingReason: null }]
    }))).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
  })

  it('requires an explicit confirmation', async () => {
    const { service } = harness()
    await expect(service.attest(buildInput({ confirmed: false })))
      .rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
  })

  it('requires a reason', async () => {
    const { service } = harness()
    await expect(service.attest(buildInput({ reason: '   ' })))
      .rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
  })

  it('downgrades a blocked attestation to degraded on a live destination', async () => {
    const { service, recordValidation } = harness({
      destination: { enabled: true, environment: 'live' }
    })
    await service.attest(buildInput({
      capabilities: [{ mode: 'meta_pixel', status: 'blocked', blockingReason: 'Pixel removed' }]
    }))
    expect(recordValidation.mock.calls[0][0].capabilities[0].status).toBe('degraded')
  })

  it('allows a forced block on a live destination', async () => {
    const { service, recordValidation } = harness({
      destination: { enabled: true, environment: 'live' }
    })
    await service.attest(buildInput({
      capabilities: [{ mode: 'meta_pixel', status: 'blocked', blockingReason: 'Pixel removed' }],
      force: true
    }))
    expect(recordValidation.mock.calls[0][0].capabilities[0].status).toBe('blocked')
  })

  it('does not downgrade a blocked attestation on a dormant destination', async () => {
    const { service, recordValidation } = harness({
      destination: { enabled: false, environment: 'test' }
    })
    await service.attest(buildInput({
      capabilities: [{ mode: 'meta_pixel', status: 'blocked', blockingReason: 'Pixel removed' }]
    }))
    expect(recordValidation.mock.calls[0][0].capabilities[0].status).toBe('blocked')
  })

  it('throws when the destination does not exist', async () => {
    const { service, readDestination } = harness()
    readDestination.mockResolvedValue(null)
    await expect(service.attest(buildInput()))
      .rejects.toMatchObject({ code: 'MEASUREMENT_NOT_FOUND' })
  })
})
