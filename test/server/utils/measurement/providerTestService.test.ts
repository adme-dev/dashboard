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

function context(
  platform: 'meta' | 'google_data_manager' | 'tiktok',
  metaDeliveryMode: 'crm' | 'web' = 'crm'
) {
  const mode = platform === 'meta'
    ? 'meta_test_events' as const
    : platform === 'tiktok'
      ? 'tiktok_test_events' as const
      : 'google_validate_only' as const
  return {
    run: {
      id: ids.run,
      mode,
      status: 'requested' as const
    },
    delivery: {
      eventId: '66666666-6666-4666-8666-666666666666',
      eventName: platform === 'tiktok' ? 'web_conversion' : 'lead_qualified',
      providerEventName: platform === 'tiktok' ? 'SubmitForm' : 'QualifiedLead',
      occurredAt: '2026-07-17T08:00:00.000Z',
      idempotencyKey: ids.idempotency,
      externalDestinationId: platform === 'tiktok' ? 'C1234567890' : '573284833843027',
      operatingAccountId: '4221552633',
      loginAccountId: '4221552633',
      metaDeliveryMode
    },
    credential: {
      credentialRef: platform === 'meta'
        ? 'MEASUREMENT_PROVIDER_META_BIG_GARAGE'
        : platform === 'tiktok'
          ? 'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE'
          : null,
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
  const deliverTikTok = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: 'tiktok-log-1',
    errorClass: null,
    redactedDiagnostic: null
  }))
  const refreshGoogleAccessToken = vi.fn(async () => 'google-access')
  const resolveProviderCredential = vi.fn(async () => 'meta-dataset-token')
  const service = createMeasurementProviderTestService({
    repository,
    deliverMeta,
    deliverGoogle,
    deliverTikTok,
    refreshGoogleAccessToken,
    resolveProviderCredential,
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
    deliverTikTok,
    refreshGoogleAccessToken,
    resolveProviderCredential
  }
}

describe('measurement provider test service', () => {
  it('sends an approved TikTok event only through Test Events and stores bounded evidence', async () => {
    const test = setup(context('tiktok'))

    const result = await test.service.run({
      ...baseInput(),
      canonicalEventName: 'web_conversion',
      mode: 'tiktok_test_events',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      ttclid: 'click-1',
      ttp: 'browser-1',
      eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
      clientUserAgent: 'Approved TikTok Test Browser'
    })

    expect(test.deliverTikTok).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'meta-dataset-token',
      environment: 'test',
      testEventCode: 'TEST123456',
      delivery: expect.objectContaining({
        externalDestinationId: 'C1234567890',
        attribution: expect.objectContaining({
          browserEventId: 'browser-event-1',
          ttclid: 'click-1',
          ttp: 'browser-1'
        })
      })
    }))
    expect(test.resolveProviderCredential).toHaveBeenCalledWith(
      'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE'
    )
    expect(test.repository.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'accepted',
      providerRequestId: 'tiktok-log-1'
    }))
    expect(result).toMatchObject({
      run: {
        mode: 'tiktok_test_events',
        status: 'accepted',
        providerRequestId: 'tiktok-log-1'
      }
    })
    expect(JSON.stringify(result)).not.toMatch(/TEST123456|browser-event-1|click-1|browser-1/)
  })

  it('fails closed when the TikTok Test Events credential is unavailable', async () => {
    const testContext = context('tiktok')
    testContext.credential.credentialRef = null
    const test = setup(testContext)

    await test.service.run({
      ...baseInput(),
      canonicalEventName: 'web_conversion',
      mode: 'tiktok_test_events',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      ttclid: 'click-1',
      ttp: null,
      eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
      clientUserAgent: 'Approved TikTok Test Browser'
    })

    expect(test.resolveProviderCredential).not.toHaveBeenCalled()
    expect(test.deliverTikTok).not.toHaveBeenCalled()
    expect(test.repository.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      errorClass: 'tiktok_events_api_credential_unavailable'
    }))
  })

  it('records a missing TikTok Pixel/Data Source id without calling the provider', async () => {
    const testContext = context('tiktok')
    testContext.delivery.externalDestinationId = ''
    const test = setup(testContext)

    await test.service.run({
      ...baseInput(),
      canonicalEventName: 'web_conversion',
      mode: 'tiktok_test_events',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      ttclid: null,
      ttp: 'browser-1',
      eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
      clientUserAgent: 'Approved TikTok Test Browser'
    })

    expect(test.deliverTikTok).not.toHaveBeenCalled()
    expect(test.repository.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      errorClass: 'tiktok_pixel_id_missing'
    }))
  })

  it('stores only redacted evidence when TikTok rejects a test event', async () => {
    const test = setup(context('tiktok'))
    test.deliverTikTok.mockResolvedValueOnce({
      outcome: 'permanent_failure',
      providerRequestId: 'tiktok-rejected-1',
      errorClass: 'tiktok_api_40002',
      redactedDiagnostic: 'TikTok Events API rejected the event'
    })

    const result = await test.service.run({
      ...baseInput(),
      canonicalEventName: 'web_conversion',
      mode: 'tiktok_test_events',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      ttclid: 'click-1',
      ttp: null,
      eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
      clientUserAgent: 'Approved TikTok Test Browser'
    })

    expect(test.repository.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      providerRequestId: 'tiktok-rejected-1',
      errorClass: 'tiktok_api_40002',
      redactedError: 'TikTok Events API rejected the event'
    }))
    expect(JSON.stringify(result)).not.toMatch(/TEST123456|browser-event-1|click-1/)
  })

  it('rejects TikTok tests without ttclid or ttp before reserving provider traffic', async () => {
    const test = setup(context('tiktok'))

    await expect(test.service.run({
      ...baseInput(),
      canonicalEventName: 'web_conversion',
      mode: 'tiktok_test_events',
      testEventCode: 'TEST123456',
      browserEventId: 'browser-event-1',
      ttclid: null,
      ttp: null,
      eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
      clientUserAgent: 'Approved TikTok Test Browser'
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })

    expect(test.repository.reserve).not.toHaveBeenCalled()
    expect(test.deliverTikTok).not.toHaveBeenCalled()
  })

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
          ttclid: null,
          ttp: null,
          eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
          clientUserAgent: 'Approved Pilot Browser'
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
})
