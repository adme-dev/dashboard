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

function metaCrmInput() {
  return {
    ...baseInput(),
    mode: 'meta_test_events' as const,
    deliveryMode: 'crm' as const,
    testEventCode: 'TEST123456',
    metaLeadId: '1234567890123456',
    browserEventId: null
  }
}

function context(
  platform: 'meta' | 'google_data_manager' | 'ga4',
  metaDeliveryMode: 'crm' | 'web' = 'crm'
) {
  const mode = platform === 'meta'
    ? 'meta_test_events' as const
    : platform === 'ga4'
      ? 'ga4_debug_validation' as const
      : 'google_validate_only' as const
  return {
    run: { id: ids.run, mode, status: 'requested' as const },
    delivery: {
      eventId: '66666666-6666-4666-8666-666666666666',
      eventName: 'lead_qualified',
      providerEventName: 'QualifiedLead',
      occurredAt: '2026-07-17T08:00:00.000Z',
      idempotencyKey: ids.idempotency,
      externalDestinationId: platform === 'ga4' ? 'G-ABC123' : '573284833843027',
      operatingAccountId: '4221552633',
      loginAccountId: '4221552633',
      metaDeliveryMode
    },
    credential: {
      credentialRef: platform === 'meta'
        ? 'MEASUREMENT_PROVIDER_META_BIG_GARAGE'
        : platform === 'ga4' ? 'MEASUREMENT_PROVIDER_GA4_BIG_GARAGE' : null,
      accessToken: platform === 'meta' ? 'meta-token' : null,
      refreshToken: platform === 'google_data_manager' ? 'google-refresh' : null,
      scopes: platform === 'google_data_manager'
        ? ['https://www.googleapis.com/auth/datamanager']
        : []
    },
    configuredCapabilityModes: platform === 'meta'
      ? ['meta_web_capi', 'meta_crm_capi', 'meta_conversion_leads']
      : platform === 'google_data_manager'
        ? ['google_data_manager']
        : ['ga4_measurement_protocol']
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
  const resolveProviderCredential = vi.fn(async () => 'meta-dataset-token')
  const validateGa4 = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: null,
    errorClass: null,
    redactedDiagnostic: null
  }))
  const recordValidation = vi.fn(async () => ({ healthStatus: 'ready' as const }))
  const service = createMeasurementProviderTestService({
    repository,
    deliverMeta,
    deliverGoogle,
    refreshGoogleAccessToken,
    resolveProviderCredential,
    validateGa4,
    recordValidation,
    graphApiVersion: 'v25.0',
    googleClientId: 'google-client',
    googleClientSecret: 'google-secret',
    now: () => new Date('2026-07-17T08:00:01.000Z')
  })
  return {
    service,
    repository,
    deliverMeta,
    deliverGoogle,
    refreshGoogleAccessToken,
    resolveProviderCredential,
    validateGa4,
    recordValidation
  }
}

describe('measurement provider test service', () => {
  it('sends an approved Meta event only through Test Events and stores redacted evidence', async () => {
    const test = setup()

    const result = await test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      deliveryMode: 'crm',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null
    })

    expect(test.deliverMeta).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'meta-dataset-token',
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
    expect(test.resolveProviderCredential).toHaveBeenCalledWith(
      'MEASUREMENT_PROVIDER_META_BIG_GARAGE'
    )
  })

  it('never substitutes a linked Meta OAuth token when the CAPI secret reference is absent', async () => {
    const metaContext = context('meta')
    metaContext.credential.credentialRef = null
    metaContext.credential.accessToken = 'linked-facebook-oauth-token'
    const test = setup(metaContext)

    await test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      deliveryMode: 'crm',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null
    })

    expect(test.resolveProviderCredential).not.toHaveBeenCalled()
    expect(test.deliverMeta).not.toHaveBeenCalled()
    expect(test.repository.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      errorClass: 'meta_capi_credential_ref_required'
    }))
  })

  it('fails closed when the referenced Meta CAPI secret binding is unavailable', async () => {
    const test = setup()
    test.resolveProviderCredential.mockResolvedValueOnce(null)

    await test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      deliveryMode: 'crm',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null
    })

    expect(test.deliverMeta).not.toHaveBeenCalled()
    expect(test.repository.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      errorClass: 'meta_capi_credential_unavailable'
    }))
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

  it('records accepted Google validate-only evidence for configured ECL without requiring Data Manager', async () => {
    const googleContext = context('google_data_manager')
    googleContext.configuredCapabilityModes = ['google_enhanced_conversions_for_leads']
    const test = setup(googleContext)

    const result = await test.service.run({
      ...baseInput(),
      mode: 'google_validate_only',
      clickIdentifier: { type: 'gclid', value: 'approved-test-gclid' }
    })

    expect(result.validation).toMatchObject({ recorded: true, healthStatus: 'ready' })
    expect(test.recordValidation).toHaveBeenCalledWith(expect.objectContaining({
      capabilities: [{
        mode: 'google_enhanced_conversions_for_leads',
        status: 'ready',
        blockingReason: null
      }],
      directlyExercised: ['google_enhanced_conversions_for_leads'],
      inferred: []
    }))
  })

  it('accepts the documented 16-digit Meta lead identifier format', async () => {
    const test = setup()

    await test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      deliveryMode: 'crm',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null
    })

    expect(test.deliverMeta).toHaveBeenCalledWith(expect.objectContaining({
      delivery: expect.objectContaining({
        attribution: expect.objectContaining({ metaLeadId: '1234567890123456' })
      })
    }))
  })

  it('rejects an overlong Meta lead identifier before reserving provider traffic', async () => {
    const test = setup()

    await expect(test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      deliveryMode: 'crm',
      testEventCode: 'TEST123456',
      metaLeadId: '12345678901234567',
      browserEventId: null
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })

    expect(test.repository.reserve).not.toHaveBeenCalled()
    expect(test.deliverMeta).not.toHaveBeenCalled()
  })

  it('rejects an unconfirmed request before reserving or calling a provider', async () => {
    const test = setup()

    await expect(test.service.run({
      ...baseInput(),
      confirmed: false,
      mode: 'meta_test_events',
      deliveryMode: 'crm',
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
      deliveryMode: 'crm',
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
      deliveryMode: 'crm',
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
      deliveryMode: 'crm',
      testEventCode: 'TEST123456',
      metaLeadId: '1234567890123456',
      browserEventId: null
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
    expect(test.repository.reserve).not.toHaveBeenCalled()
  })

  it('sends an approved Meta Web Test Event with shared browser identity and ephemeral context', async () => {
    const webContext = context('meta', 'web')
    webContext.delivery = {
      ...webContext.delivery,
      eventName: 'lead_created',
      providerEventName: 'Lead'
    }
    const test = setup(webContext)

    const result = await test.service.run({
      ...baseInput(),
      canonicalEventName: 'lead_created',
      mode: 'meta_test_events',
      deliveryMode: 'web',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      fbc: 'fb.1.1234567890123.approved-click',
      fbp: null,
      eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
      clientUserAgent: 'Approved Pilot Browser'
    })

    expect(test.deliverMeta).toHaveBeenCalledWith(expect.objectContaining({
      environment: 'test',
      testEventCode: 'TEST123456',
      delivery: expect.objectContaining({
        metaDeliveryMode: 'web',
        attribution: {
          browserEventId: 'browser-event-1',
          metaLeadId: null,
          gclid: null,
          gbraid: null,
          wbraid: null,
          fbc: 'fb.1.1234567890123.approved-click',
          fbp: null,
          eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
          clientUserAgent: 'Approved Pilot Browser',
          gaClientId: null
        }
      })
    }))
    expect(JSON.stringify(result)).not.toContain('browser-event-1')
    expect(JSON.stringify(result)).not.toContain('approved-click')
  })

  it('rejects Meta Web tests without fbc or fbp before reservation', async () => {
    const test = setup()

    await expect(test.service.run({
      ...baseInput(),
      canonicalEventName: 'lead_created',
      mode: 'meta_test_events',
      deliveryMode: 'web',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      fbc: null,
      fbp: null,
      eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
      clientUserAgent: 'Approved Pilot Browser'
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })

    expect(test.repository.reserve).not.toHaveBeenCalled()
    expect(test.deliverMeta).not.toHaveBeenCalled()
  })

  it('requires the approved browser user agent for a Meta Web event', async () => {
    const test = setup(context('meta', 'web'))

    await expect(test.service.run({
      ...baseInput(),
      canonicalEventName: 'lead_created',
      mode: 'meta_test_events',
      deliveryMode: 'web',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      fbc: 'fb.1.1234567890123.approved-click',
      fbp: null,
      eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
      clientUserAgent: null
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })

    expect(test.repository.reserve).not.toHaveBeenCalled()
  })

  it('rejects browser URL and user-agent leakage through the persisted approval reason', async () => {
    const test = setup(context('meta', 'web'))

    await expect(test.service.run({
      ...baseInput(),
      canonicalEventName: 'lead_created',
      mode: 'meta_test_events',
      deliveryMode: 'web',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      fbc: 'fb.1.1234567890123.approved-click',
      fbp: null,
      eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
      clientUserAgent: 'Approved Pilot Browser',
      reason: 'Use Approved Pilot Browser for this controlled test'
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })

    expect(test.repository.reserve).not.toHaveBeenCalled()
  })

  it('rejects source URLs with userinfo, query parameters, or fragments', async () => {
    const test = setup(context('meta', 'web'))

    for (const eventSourceUrl of [
      'https://operator@example.com/enquire',
      'https://example.com/enquire?email=person%40example.com',
      'https://example.com/enquire#contact'
    ]) {
      await expect(test.service.run({
        ...baseInput(),
        canonicalEventName: 'lead_created',
        mode: 'meta_test_events',
        deliveryMode: 'web',
        testEventCode: 'TEST123456',
        browserEventId: 'browser-event-1',
        fbc: 'fb.1.1234567890123.approved-click',
        fbp: null,
        eventSourceUrl,
        clientUserAgent: 'Approved Pilot Browser'
      })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
    }

    expect(test.repository.reserve).not.toHaveBeenCalled()
  })

  it('rejects malformed Meta browser identifiers before reservation', async () => {
    const test = setup(context('meta', 'web'))

    await expect(test.service.run({
      ...baseInput(),
      canonicalEventName: 'lead_created',
      mode: 'meta_test_events',
      deliveryMode: 'web',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      fbc: 'not-a-meta-browser-id',
      fbp: null,
      eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
      clientUserAgent: 'Approved Pilot Browser'
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })

    expect(test.repository.reserve).not.toHaveBeenCalled()
  })

  it('rejects downstream lifecycle events on the Meta Web delivery path', async () => {
    const test = setup()

    await expect(test.service.run({
      ...baseInput(),
      mode: 'meta_test_events',
      deliveryMode: 'web',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      fbc: 'fb.1.1234567890123.approved-click',
      fbp: null,
      eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
      clientUserAgent: 'Approved Pilot Browser'
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })

    expect(test.repository.reserve).not.toHaveBeenCalled()
    expect(test.deliverMeta).not.toHaveBeenCalled()
  })

  it('runs a GA4 debug validation through the debug endpoint provider', async () => {
    const test = setup(context('ga4'))

    const result = await test.service.run({
      ...baseInput(),
      mode: 'ga4_debug_validation',
      gaClientId: '123.456'
    })

    expect(test.validateGa4).toHaveBeenCalledWith(expect.objectContaining({
      gaClientId: '123.456',
      apiSecret: 'meta-dataset-token'
    }))
    expect(test.deliverGoogle).not.toHaveBeenCalled()
    expect(result.run.status).toBe('accepted')
  })

  it('rejects a GA4 test with a malformed gaClientId before reserving provider traffic', async () => {
    const test = setup(context('ga4'))

    await expect(test.service.run({
      ...baseInput(),
      mode: 'ga4_debug_validation',
      gaClientId: 'not-a-client-id'
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
    expect(test.repository.reserve).not.toHaveBeenCalled()
  })

  it('records validation evidence for the capabilities a successful test covers', async () => {
    const test = setup()

    const result = await test.service.run(metaCrmInput())

    expect(test.recordValidation).toHaveBeenCalledOnce()
    const evidence = test.recordValidation.mock.calls[0][0] as Record<string, never>
    expect(evidence.actor).toEqual({ type: 'system', id: ids.actor })
    expect((evidence.capabilities as Array<{ mode: string }>).map(c => c.mode)).toEqual([
      'meta_web_capi', 'meta_crm_capi', 'meta_conversion_leads'
    ])
    expect((evidence.capabilities as Array<{ status: string }>).every(c => c.status === 'ready')).toBe(true)
    expect(result.validation.recorded).toBe(true)
    expect(result.validation.healthStatus).toBe('ready')
  })

  it('never records evidence for meta_pixel', async () => {
    const test = setup()

    await test.service.run(metaCrmInput())

    const evidence = test.recordValidation.mock.calls[0][0] as Record<string, never>
    expect((evidence.capabilities as Array<{ mode: string }>).map(c => c.mode))
      .not.toContain('meta_pixel')
  })

  it('records blocked evidence with a reason when the provider rejects the event', async () => {
    const test = setup()
    test.deliverMeta.mockResolvedValue({
      outcome: 'permanent_failure' as const,
      providerRequestId: null,
      errorClass: 'meta_invalid_dataset',
      redactedDiagnostic: 'Dataset rejected the event'
    })

    await test.service.run(metaCrmInput())

    const evidence = test.recordValidation.mock.calls[0][0] as Record<string, never>
    const capabilities = evidence.capabilities as Array<{ status: string, blockingReason: string | null }>
    expect(capabilities).toHaveLength(3)
    expect(capabilities.every(c => c.status === 'blocked')).toBe(true)
    expect(capabilities.every(c => Boolean(c.blockingReason))).toBe(true)
  })

  it('records evidence for an accepted result carrying an empty-string providerRequestId', async () => {
    const test = setup()
    // Meta can return an accepted test event with fbtrace_id: '' — a successful
    // validation whose evidence must not be thrown away by the schema's
    // .trim().min(1) on providerRequestId.
    test.deliverMeta.mockResolvedValue({
      outcome: 'accepted' as const,
      providerRequestId: '',
      errorClass: null,
      redactedDiagnostic: ''
    })

    const result = await test.service.run(metaCrmInput())

    expect(test.recordValidation).toHaveBeenCalledOnce()
    const evidence = test.recordValidation.mock.calls[0][0] as Record<string, unknown>
    expect(evidence.providerRequestId).toBeNull()
    expect(evidence.redactedError).toBeNull()
    expect(result.validation.recorded).toBe(true)
  })

  it('falls back to errorClass for the blocking reason when the diagnostic is an empty string', async () => {
    const test = setup()
    test.deliverMeta.mockResolvedValue({
      outcome: 'permanent_failure' as const,
      providerRequestId: null,
      errorClass: 'meta_invalid_dataset',
      redactedDiagnostic: ''
    })

    await test.service.run(metaCrmInput())

    const evidence = test.recordValidation.mock.calls[0][0] as Record<string, never>
    const capabilities = evidence.capabilities as Array<{ blockingReason: string | null }>
    expect(capabilities.every(c => c.blockingReason === 'meta_invalid_dataset')).toBe(true)
  })

  it('marks a retryable provider failure as degraded rather than blocked', async () => {
    const test = setup()
    test.deliverMeta.mockResolvedValue({
      outcome: 'retryable' as const,
      providerRequestId: null,
      errorClass: 'provider_network_error',
      redactedDiagnostic: 'Provider validation failed before a response'
    })

    await test.service.run(metaCrmInput())

    const evidence = test.recordValidation.mock.calls[0][0] as Record<string, never>
    const capabilities = evidence.capabilities as Array<{ status: string }>
    expect(capabilities).toHaveLength(3)
    expect(capabilities.every(c => c.status === 'degraded')).toBe(true)
  })

  it('records which capabilities were directly exercised versus inferred', async () => {
    const test = setup()

    await test.service.run(metaCrmInput())

    // baseInput() uses canonicalEventName 'lead_qualified', a downstream
    // lifecycle outcome, so the crm call exercises both crm capabilities and
    // only the web capability is inferred from the Meta collapse.
    const evidence = test.recordValidation.mock.calls[0][0] as Record<string, never>
    expect(evidence.directlyExercised).toEqual(['meta_crm_capi', 'meta_conversion_leads'])
    expect(evidence.inferred).toEqual(['meta_web_capi'])
  })

  it('reports a version conflict without failing the test run', async () => {
    const test = setup()
    test.recordValidation.mockRejectedValue(
      Object.assign(new Error('conflict'), { code: 'MEASUREMENT_VERSION_CONFLICT' })
    )

    const result = await test.service.run(metaCrmInput())

    expect(result.run.status).toBe('accepted')
    expect(result.validation.recorded).toBe(false)
    expect(result.validation.skippedReason).toBe('version_conflict')
  })

  it('does not re-record evidence for an idempotent replay of an existing run', async () => {
    const test = setup()
    test.repository.reserve.mockResolvedValue({
      status: 'existing' as const,
      run: {
        id: ids.run,
        mode: 'meta_test_events' as const,
        status: 'accepted' as const,
        providerRequestId: 'meta-trace',
        errorClass: null,
        redactedError: null,
        completedAt: '2026-07-17T08:00:01.000Z'
      }
    })

    const result = await test.service.run(metaCrmInput())

    expect(test.recordValidation).not.toHaveBeenCalled()
    expect(result.validation.recorded).toBe(false)
    expect(result.validation.skippedReason).toBe('already_run')
  })
})
