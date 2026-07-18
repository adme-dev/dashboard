import { describe, expect, it, vi } from 'vitest'
import { createMeasurementProviderTestService } from '~~/server/utils/measurement/providerTestService'

const ids = {
  client: '11111111-1111-4111-8111-111111111111',
  destination: '22222222-2222-4222-8222-222222222222',
  run: '33333333-3333-4333-8333-333333333333',
  actor: '44444444-4444-4444-8444-444444444444',
  idempotency: '55555555-5555-4555-8555-555555555555'
}

function baseInput() {
  return {
    clientId: ids.client,
    destinationId: ids.destination,
    expectedConfigVersion: 3,
    canonicalEventName: 'lead_qualified' as const,
    occurredAt: '2026-07-17T08:00:00.000Z',
    idempotencyKey: ids.idempotency,
    reason: 'Approved controlled-pilot validation',
    confirmed: true as const,
    actor: { id: ids.actor }
  }
}

function context(platform: 'meta' | 'google_data_manager') {
  return {
    run: {
      id: ids.run,
      mode: platform === 'meta' ? 'meta_test_events' as const : 'google_validate_only' as const,
      status: 'requested' as const
    },
    delivery: {
      eventId: '66666666-6666-4666-8666-666666666666',
      eventName: 'lead_qualified',
      providerEventName: 'QualifiedLead',
      occurredAt: '2026-07-17T08:00:00.000Z',
      idempotencyKey: ids.idempotency,
      externalDestinationId: '573284833843027',
      operatingAccountId: '4221552633',
      loginAccountId: '4221552633'
    },
    credential: {
      accessToken: platform === 'meta' ? 'meta-token' : null,
      refreshToken: platform === 'google_data_manager' ? 'google-refresh' : null,
      scopes: platform === 'google_data_manager'
        ? ['https://www.googleapis.com/auth/datamanager']
        : []
    }
  }
}

function setup(reserved = context('meta')) {
  const repository = {
    reserve: vi.fn(async () => ({ status: 'reserved' as const, context: reserved })),
    complete: vi.fn(async (_input: unknown) => undefined)
  }
  const deliverMeta = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: 'meta-trace',
    errorClass: null,
    redactedDiagnostic: null
  }))
  const deliverGoogle = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: null,
    errorClass: null,
    redactedDiagnostic: null
  }))
  const refreshGoogleAccessToken = vi.fn(async () => 'google-access')
  const service = createMeasurementProviderTestService({
    repository,
    deliverMeta,
    deliverGoogle,
    refreshGoogleAccessToken,
    graphApiVersion: 'v25.0',
    googleClientId: 'google-client',
    googleClientSecret: 'google-secret',
    now: () => new Date('2026-07-17T08:00:01.000Z')
  })
  return { service, repository, deliverMeta, deliverGoogle, refreshGoogleAccessToken }
}

describe('measurement provider test service', () => {
  it('sends an approved Meta event only through Test Events and stores redacted evidence', async () => {
    const test = setup()

    const result = await test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: 'browser-event-1'
    })

    expect(test.deliverMeta).toHaveBeenCalledWith(expect.objectContaining({
      environment: 'test',
      testEventCode: 'TEST123456',
      delivery: expect.objectContaining({
        attribution: expect.objectContaining({
          metaLeadId: '1234567890123456',
          browserEventId: null
        })
      })
    }))
    expect(test.repository.complete).toHaveBeenCalledWith(expect.objectContaining({
      runId: ids.run,
      status: 'accepted',
      providerRequestId: 'meta-trace'
    }))
    expect(JSON.stringify(result)).not.toContain('TEST123456')
    expect(JSON.stringify(result)).not.toContain('1234567890123456')
  })

  it('uses Google validate-only and accepts the expected empty provider request id', async () => {
    const test = setup(context('google_data_manager'))

    await test.service.run({
      ...baseInput(),
      mode: 'google_validate_only',
      clickIdentifier: { type: 'gclid', value: 'approved-test-gclid' }
    })

    expect(test.refreshGoogleAccessToken).toHaveBeenCalled()
    expect(test.deliverGoogle).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'google-access',
      validateOnly: true
    }))
  })

  it('rejects an unconfirmed request before reserving or calling a provider', async () => {
    const test = setup()

    await expect(test.service.run({
      ...baseInput(),
      confirmed: false,
      mode: 'meta_test_events',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
    expect(test.repository.reserve).not.toHaveBeenCalled()
    expect(test.deliverMeta).not.toHaveBeenCalled()
  })

  it('returns existing idempotent evidence without sending twice', async () => {
    const test = setup()
    test.repository.reserve.mockResolvedValueOnce({
      status: 'existing',
      run: { id: ids.run, mode: 'meta_test_events', status: 'accepted' }
    } as never)

    await test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null
    })

    expect(test.deliverMeta).not.toHaveBeenCalled()
    expect(test.repository.complete).not.toHaveBeenCalled()
  })

  it('rejects approval reasons that repeat transient provider identifiers', async () => {
    const test = setup()

    await expect(test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null,
      reason: 'Use Meta lead 1234567890123456 for the pilot'
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
    expect(test.repository.reserve).not.toHaveBeenCalled()
  })

  it('rejects future-dated provider evidence before reservation', async () => {
    const test = setup()

    await expect(test.service.run({
      ...baseInput(),
      occurredAt: '2026-07-17T09:00:00.000Z',
      mode: 'meta_test_events',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
    expect(test.repository.reserve).not.toHaveBeenCalled()
  })
})
