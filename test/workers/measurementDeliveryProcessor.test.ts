import { describe, expect, it, vi } from 'vitest'
import { createMeasurementDeliveryProcessor } from '../../workers/measurement-delivery/src/delivery'
import { GoogleOAuthRefreshError } from '../../workers/measurement-delivery/src/providers'

const MESSAGE = {
  schemaVersion: 1 as const,
  clientId: '11111111-1111-4111-8111-111111111111',
  eventId: '22222222-2222-4222-8222-222222222222',
  enqueuedAt: '2026-07-17T06:00:00.000Z'
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    deliveryId: '33333333-3333-4333-8333-333333333333',
    destinationId: '44444444-4444-4444-8444-444444444444',
    attemptNumber: 1,
    platform: 'meta' as const,
    profileEnabled: true,
    profileEnvironment: 'live' as const,
    profileCacheCurrent: true,
    destinationEnabled: true,
    destinationEnvironment: 'live' as const,
    destinationHealthStatus: 'ready' as const,
    deliveryConfigCurrent: true,
    eventId: MESSAGE.eventId,
    eventName: 'lead_qualified',
    providerEventName: 'QualifiedLead',
    occurredAt: '2026-07-17T06:00:00.000Z',
    idempotencyKey: 'v1:canonical-event-key',
    externalDestinationId: '123456789012345',
    operatingAccountId: '9876543210',
    loginAccountId: '9876543210',
    metaDeliveryMode: 'crm' as const,
    credentialRef: 'MEASUREMENT_PROVIDER_META_BIG_GARAGE',
    accessToken: 'linked-facebook-oauth-token',
    refreshToken: null,
    connectionScopes: ['ads_management'],
    attribution: {
      browserEventId: 'browser-event-1',
      metaLeadId: '123456789012345',
      gclid: null,
      gbraid: null,
      wbraid: null,
      fbc: null,
      fbp: null,
      ttclid: null,
      ttp: null,
      eventSourceUrl: null,
      clientUserAgent: null
    },
    ...overrides
  }
}

function setup(claims: Array<ReturnType<typeof claim> | null>) {
  const claimNext = vi.fn()
  for (const item of claims) claimNext.mockResolvedValueOnce(item)
  const complete = vi.fn(async () => undefined)
  const deliverMeta = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: 'meta-request-1',
    errorClass: null,
    redactedDiagnostic: null
  }))
  const deliverGoogle = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: 'google-request-1',
    errorClass: null,
    redactedDiagnostic: null
  }))
  const deliverTikTok = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: 'tiktok-request-1',
    errorClass: null,
    redactedDiagnostic: null
  }))
  const refreshGoogleAccessToken = vi.fn(async () => 'fresh-google-token')
  const resolveProviderCredential = vi.fn(async () => 'meta-dataset-token')
  const processor = createMeasurementDeliveryProcessor({
    repository: { claimNext, complete },
    deliverMeta,
    deliverGoogle,
    deliverTikTok,
    refreshGoogleAccessToken,
    resolveProviderCredential,
    workerId: () => 'measurement-worker:test',
    now: () => new Date('2026-07-17T06:05:00.000Z'),
    metaGraphApiVersion: 'v25.0',
    googleClientId: 'google-client-id',
    googleClientSecret: 'google-client-secret',
    fetch: vi.fn() as never
  })
  return {
    processor,
    claimNext,
    complete,
    deliverMeta,
    deliverGoogle,
    deliverTikTok,
    refreshGoogleAccessToken,
    resolveProviderCredential
  }
}

describe('measurement delivery processor', () => {
  it('claims and records each eligible destination independently', async () => {
    const meta = claim()
    const google = claim({
      deliveryId: '55555555-5555-4555-8555-555555555555',
      destinationId: '66666666-6666-4666-8666-666666666666',
      platform: 'google_data_manager',
      accessToken: null,
      refreshToken: 'google-refresh-token',
      connectionScopes: ['https://www.googleapis.com/auth/datamanager'],
      attribution: { ...claim().attribution, metaLeadId: null, gclid: 'gclid-1' }
    })
    const { processor, complete, deliverMeta, deliverGoogle, refreshGoogleAccessToken } = setup([
      meta,
      google,
      null
    ])

    const result = await processor.process(MESSAGE)

    expect(result).toEqual({ claimed: 2, accepted: 2, retryable: 0, permanentFailure: 0, policySkipped: 0 })
    expect(deliverMeta).toHaveBeenCalledOnce()
    expect(deliverMeta).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'meta-dataset-token' }))
    expect(refreshGoogleAccessToken).toHaveBeenCalledWith({
      refreshToken: 'google-refresh-token',
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: expect.any(Function)
    })
    expect(deliverGoogle).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'fresh-google-token' }))
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('never sends Meta with a linked OAuth token when the CAPI secret reference is absent', async () => {
    const meta = claim({ credentialRef: null, accessToken: 'linked-facebook-oauth-token' })
    const state = setup([meta, null])

    const result = await state.processor.process(MESSAGE)

    expect(result).toMatchObject({ claimed: 1, permanentFailure: 1 })
    expect(state.resolveProviderCredential).not.toHaveBeenCalled()
    expect(state.deliverMeta).not.toHaveBeenCalled()
    expect(state.complete).toHaveBeenCalledWith(meta, expect.objectContaining({
      errorClass: 'meta_capi_credential_ref_required'
    }), expect.any(Date))
  })

  it('fails closed when the referenced Meta CAPI binding is unavailable', async () => {
    const meta = claim()
    const state = setup([meta, null])
    state.resolveProviderCredential.mockResolvedValueOnce(null)

    const result = await state.processor.process(MESSAGE)

    expect(result).toMatchObject({ claimed: 1, permanentFailure: 1 })
    expect(state.deliverMeta).not.toHaveBeenCalled()
    expect(state.complete).toHaveBeenCalledWith(meta, expect.objectContaining({
      errorClass: 'meta_capi_credential_unavailable'
    }), expect.any(Date))
  })

  it('routes TikTok through its purpose-scoped Events API credential', async () => {
    const tiktok = claim({
      platform: 'tiktok',
      providerEventName: 'SubmitForm',
      externalDestinationId: 'C1234567890',
      credentialRef: 'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE',
      attribution: {
        ...claim().attribution,
        browserEventId: 'browser-event-1',
        ttclid: 'click-1',
        ttp: 'browser-1',
        eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
      }
    })
    const state = setup([tiktok, null])
    state.resolveProviderCredential.mockResolvedValueOnce('tiktok-events-api-token')

    await expect(state.processor.process(MESSAGE)).resolves.toMatchObject({
      claimed: 1,
      accepted: 1
    })
    expect(state.resolveProviderCredential).toHaveBeenCalledWith(
      'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE'
    )
    expect(state.deliverTikTok).toHaveBeenCalledWith({
      delivery: tiktok,
      accessToken: 'tiktok-events-api-token',
      environment: 'live',
      fetch: expect.any(Function)
    })
    expect(state.complete).toHaveBeenCalledWith(tiktok, expect.objectContaining({
      outcome: 'accepted',
      providerRequestId: 'tiktok-request-1'
    }), expect.any(Date))
  })

  it('fails closed when a TikTok Events API credential is unavailable', async () => {
    const tiktok = claim({
      platform: 'tiktok',
      credentialRef: 'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE'
    })
    const state = setup([tiktok, null])
    state.resolveProviderCredential.mockResolvedValueOnce(null)

    await expect(state.processor.process(MESSAGE)).resolves.toMatchObject({
      claimed: 1,
      permanentFailure: 1
    })
    expect(state.deliverTikTok).not.toHaveBeenCalled()
    expect(state.complete).toHaveBeenCalledWith(tiktok, {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'tiktok_events_api_credential_unavailable',
      redactedDiagnostic: 'TikTok Events API secret binding is unavailable'
    }, expect.any(Date))
  })

  it('policy-skips Google delivery until the connected account has the Data Manager scope', async () => {
    const google = claim({
      platform: 'google_data_manager',
      refreshToken: 'google-refresh-token',
      connectionScopes: ['https://www.googleapis.com/auth/adwords']
    })
    const { processor, complete, deliverGoogle, refreshGoogleAccessToken } = setup([google, null])

    const result = await processor.process(MESSAGE)

    expect(result).toMatchObject({ claimed: 1, policySkipped: 1 })
    expect(refreshGoogleAccessToken).not.toHaveBeenCalled()
    expect(deliverGoogle).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith(google, {
      outcome: 'policy_skipped',
      providerRequestId: null,
      errorClass: 'google_datamanager_reconsent_required',
      redactedDiagnostic: 'Google connection must be re-consented for Data Manager'
    }, expect.any(Date))
  })

  it('continues Google ingestion while earlier requests are validating', async () => {
    const google = claim({
      platform: 'google_data_manager',
      destinationHealthStatus: 'validating',
      refreshToken: 'google-refresh-token',
      connectionScopes: ['https://www.googleapis.com/auth/datamanager']
    })
    const { processor, deliverGoogle } = setup([google, null])

    await expect(processor.process(MESSAGE)).resolves.toMatchObject({
      claimed: 1,
      accepted: 1,
      policySkipped: 0
    })
    expect(deliverGoogle).toHaveBeenCalledOnce()
  })

  it('turns provider network exceptions into a redacted retryable outcome', async () => {
    const meta = claim()
    const state = setup([meta, null])
    state.deliverMeta.mockRejectedValue(new TypeError('secret-bearing network failure'))

    const result = await state.processor.process(MESSAGE)

    expect(result).toMatchObject({ claimed: 1, retryable: 1 })
    expect(state.complete).toHaveBeenCalledWith(meta, {
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'provider_network_error',
      redactedDiagnostic: 'Provider request failed before a response'
    }, expect.any(Date))
    expect(JSON.stringify(state.complete.mock.calls)).not.toContain('secret-bearing')
  })

  it('records a rejected Google refresh grant as a permanent re-consent failure', async () => {
    const google = claim({
      platform: 'google_data_manager',
      refreshToken: 'google-refresh-token',
      connectionScopes: ['https://www.googleapis.com/auth/datamanager']
    })
    const state = setup([google, null])
    state.refreshGoogleAccessToken.mockRejectedValue(new GoogleOAuthRefreshError(400))

    const result = await state.processor.process(MESSAGE)

    expect(result).toMatchObject({ claimed: 1, permanentFailure: 1 })
    expect(state.complete).toHaveBeenCalledWith(google, {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'google_oauth_reconsent_required',
      redactedDiagnostic: 'Google OAuth grant is no longer valid'
    }, expect.any(Date))
  })
})
