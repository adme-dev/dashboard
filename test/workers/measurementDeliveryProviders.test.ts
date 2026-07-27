import { describe, expect, it, vi } from 'vitest'
import {
  deliverGa4MeasurementProtocolEvent,
  deliverGoogleDataManagerEvent,
  deliverMetaConversionEvent,
  refreshGoogleDataManagerAccessToken
} from '../../workers/measurement-delivery/src/providers'

const baseDelivery = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventName: 'lead_qualified',
  providerEventName: 'QualifiedLead',
  occurredAt: '2026-07-17T06:00:00.000Z',
  idempotencyKey: 'v1:canonical-event-key',
  externalDestinationId: '123456789012345',
  operatingAccountId: '9876543210',
  loginAccountId: '9876543210',
  metaDeliveryMode: 'crm' as const,
  value: null,
  currency: null,
  attribution: {
    browserEventId: null,
    metaLeadId: '123456789012345',
    gclid: 'gclid-1',
    gbraid: null,
    wbraid: null,
    fbc: null,
    fbp: null,
    eventSourceUrl: null,
    clientUserAgent: null,
    gaClientId: null
  }
}

describe('measurement delivery provider adapters', () => {
  it('sends a server-only Meta CRM event with lead matching and its canonical server event ID', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      events_received: 1,
      fbtrace_id: 'meta-trace-1'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await deliverMetaConversionEvent({
      delivery: baseDelivery,
      accessToken: 'meta-access-token',
      graphApiVersion: 'v25.0',
      fetch
    })

    expect(result).toEqual({
      outcome: 'accepted',
      providerRequestId: 'meta-trace-1',
      errorClass: null,
      redactedDiagnostic: null
    })
    const [url, request] = fetch.mock.calls[0]!
    expect(url).toBe('https://graph.facebook.com/v25.0/123456789012345/events')
    expect(request.headers).toMatchObject({ authorization: 'Bearer meta-access-token' })
    expect(JSON.parse(request.body as string)).toEqual({
      data: [{
        event_name: 'QualifiedLead',
        event_time: 1784268000,
        event_id: '11111111-1111-4111-8111-111111111111',
        action_source: 'system_generated',
        user_data: { lead_id: '123456789012345' },
        custom_data: {
          lead_event_source: 'XeroFlow',
          event_source: 'crm'
        }
      }]
    })
  })

  it('sends a Meta Web CAPI lead with the same browser event ID and browser match context', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      events_received: 1,
      fbtrace_id: 'meta-web-trace-1'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(deliverMetaConversionEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'lead_created',
        providerEventName: 'Lead',
        metaDeliveryMode: 'web',
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          metaLeadId: null,
          fbc: 'fb.1.123.click',
          fbp: 'fb.1.123.browser',
          eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
          clientUserAgent: 'Pilot Browser'
        }
      },
      accessToken: 'meta-access-token',
      graphApiVersion: 'v25.0',
      fetch
    })).resolves.toMatchObject({ outcome: 'accepted' })

    const [, request] = fetch.mock.calls[0]!
    expect(JSON.parse(request.body as string)).toEqual({
      data: [{
        event_name: 'Lead',
        event_time: 1784268000,
        event_id: 'browser-event-1',
        action_source: 'website',
        event_source_url: 'https://www.biggaragesubaru.com.au/enquire',
        user_data: {
          fbc: 'fb.1.123.click',
          fbp: 'fb.1.123.browser',
          client_user_agent: 'Pilot Browser'
        }
      }]
    })
  })

  it('routes an explicitly requested Meta pilot event through Test Events', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      events_received: 1,
      fbtrace_id: 'meta-test-trace-1'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(deliverMetaConversionEvent({
      delivery: baseDelivery,
      accessToken: 'meta-access-token',
      graphApiVersion: 'v25.0',
      environment: 'test',
      testEventCode: 'TEST123456',
      fetch
    })).resolves.toMatchObject({ outcome: 'accepted' })

    const [, request] = fetch.mock.calls[0]!
    expect(JSON.parse(request.body as string)).toMatchObject({
      test_event_code: 'TEST123456'
    })
  })

  it('refuses to attach a Meta Test Events code to live delivery', async () => {
    const fetch = vi.fn()

    await expect(deliverMetaConversionEvent({
      delivery: baseDelivery,
      accessToken: 'meta-access-token',
      graphApiVersion: 'v25.0',
      environment: 'live',
      testEventCode: 'TEST123456',
      fetch
    })).resolves.toMatchObject({
      outcome: 'permanent_failure',
      errorClass: 'meta_test_code_live_forbidden'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses malformed Meta Test Events codes before dispatch', async () => {
    const fetch = vi.fn()

    await expect(deliverMetaConversionEvent({
      delivery: baseDelivery,
      accessToken: 'meta-access-token',
      graphApiVersion: 'v25.0',
      environment: 'test',
      testEventCode: 'invalid code with spaces',
      fetch
    })).resolves.toMatchObject({
      outcome: 'permanent_failure',
      errorClass: 'invalid_meta_test_event_code'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses Meta delivery without a supported match key', async () => {
    const fetch = vi.fn()

    const result = await deliverMetaConversionEvent({
      delivery: {
        ...baseDelivery,
        attribution: { ...baseDelivery.attribution, metaLeadId: null }
      },
      accessToken: 'meta-access-token',
      graphApiVersion: 'v25.0',
      fetch
    })

    expect(result).toMatchObject({ outcome: 'permanent_failure', errorClass: 'missing_meta_match_key' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends a Google Ads offline conversion with a stable transaction ID and click identifier', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      requestId: 'google-request-1'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await deliverGoogleDataManagerEvent({
      delivery: baseDelivery,
      accessToken: 'google-access-token',
      fetch
    })

    expect(result).toEqual({
      outcome: 'accepted',
      providerRequestId: 'google-request-1',
      errorClass: null,
      redactedDiagnostic: null
    })
    const [url, request] = fetch.mock.calls[0]!
    expect(url).toBe('https://datamanager.googleapis.com/v1/events:ingest')
    expect(request.headers).toMatchObject({ authorization: 'Bearer google-access-token' })
    expect(JSON.parse(request.body as string)).toEqual({
      destinations: [{
        operatingAccount: { accountType: 'GOOGLE_ADS', accountId: '9876543210' },
        loginAccount: { accountType: 'GOOGLE_ADS', accountId: '9876543210' },
        productDestinationId: '123456789012345'
      }],
      encoding: 'HEX',
      events: [{
        adIdentifiers: { gclid: 'gclid-1' },
        eventTimestamp: '2026-07-17T06:00:00.000Z',
        transactionId: 'v1:canonical-event-key',
        eventSource: 'WEB'
      }],
      validateOnly: false
    })
  })

  it('reuses the browser event ID as Google transactionId for a paired web conversion', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ requestId: 'google-request-web' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))

    await deliverGoogleDataManagerEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'lead_created',
        attribution: { ...baseDelivery.attribution, browserEventId: 'browser-event-1' }
      },
      accessToken: 'google-access-token',
      fetch
    })

    const [, request] = fetch.mock.calls[0]!
    expect(JSON.parse(request.body as string).events[0].transactionId).toBe('browser-event-1')
  })

  it('retries a browser-paired Google event while its tracking match context is still arriving', async () => {
    const fetch = vi.fn()

    await expect(deliverGoogleDataManagerEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'lead_created',
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          gclid: null,
          gbraid: null,
          wbraid: null
        }
      },
      accessToken: 'google-access-token',
      fetch
    })).resolves.toMatchObject({
      outcome: 'retryable',
      errorClass: 'google_browser_context_unavailable'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('validates a Google pilot event without executing the conversion', async () => {
    const fetch = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))

    await expect(deliverGoogleDataManagerEvent({
      delivery: baseDelivery,
      accessToken: 'google-access-token',
      validateOnly: true,
      fetch
    })).resolves.toEqual({
      outcome: 'accepted',
      providerRequestId: null,
      errorClass: null,
      redactedDiagnostic: null
    })

    const [, request] = fetch.mock.calls[0]!
    expect(JSON.parse(request.body as string)).toMatchObject({ validateOnly: true })
  })

  it('classifies provider throttling as retryable without retaining response content', async () => {
    const fetch = vi.fn(async () => new Response('credential-bearing provider body', { status: 429 }))

    const result = await deliverGoogleDataManagerEvent({
      delivery: baseDelivery,
      accessToken: 'google-access-token',
      fetch
    })

    expect(result).toEqual({
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'provider_http_429',
      redactedDiagnostic: 'Google Data Manager returned HTTP 429'
    })
    expect(JSON.stringify(result)).not.toContain('credential-bearing')
  })

  it('retries a Google success response that cannot be reconciled without a request ID', async () => {
    const fetch = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))

    await expect(deliverGoogleDataManagerEvent({
      delivery: baseDelivery,
      accessToken: 'google-access-token',
      fetch
    })).resolves.toEqual({
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'google_request_id_missing',
      redactedDiagnostic: 'Google Data Manager did not return a request ID'
    })
  })

  it('classifies a rejected Google refresh grant as a permanent re-consent condition', async () => {
    const fetch = vi.fn(async () => new Response('token response detail', { status: 400 }))

    await expect(refreshGoogleDataManagerAccessToken({
      refreshToken: 'refresh-token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetch
    })).rejects.toMatchObject({
      name: 'GoogleOAuthRefreshError',
      status: 400,
      retryable: false,
      message: 'Google OAuth refresh failed'
    })
  })

  it('includes value and currency in the Meta CRM payload when a conversion value is present', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      events_received: 1,
      fbtrace_id: 'meta-trace-value'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await deliverMetaConversionEvent({
      delivery: { ...baseDelivery, eventName: 'lead_won', value: 15000.5, currency: 'AUD' },
      accessToken: 'meta-access-token',
      graphApiVersion: 'v25.0',
      fetch
    })

    const [, request] = fetch.mock.calls[0]!
    expect(JSON.parse(request.body as string).data[0].custom_data).toEqual({
      lead_event_source: 'XeroFlow',
      event_source: 'crm',
      value: 15000.5,
      currency: 'AUD'
    })
  })

  it('sends a Google Data Manager event with a root-level conversion value and currency', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      requestId: 'google-request-value'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await deliverGoogleDataManagerEvent({
      delivery: { ...baseDelivery, eventName: 'lead_won', value: 15000.5, currency: 'AUD' },
      accessToken: 'google-access-token',
      fetch
    })

    const [, request] = fetch.mock.calls[0]!
    expect(JSON.parse(request.body as string).events[0]).toEqual({
      adIdentifiers: { gclid: 'gclid-1' },
      eventTimestamp: '2026-07-17T06:00:00.000Z',
      transactionId: 'v1:canonical-event-key',
      eventSource: 'WEB',
      conversionValue: 15000.5,
      currency: 'AUD'
    })
  })
})

describe('deliverGa4MeasurementProtocolEvent', () => {
  it('posts to the GA4 Measurement Protocol collect endpoint with the real client_id', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))

    const result = await deliverGa4MeasurementProtocolEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'phone_click',
        providerEventName: 'phone_click',
        externalDestinationId: 'G-ABCDEFG123',
        attribution: { ...baseDelivery.attribution, gaClientId: '1234567890.1234567890' }
      },
      apiSecret: 'ga4-api-secret',
      fetch
    })

    expect(result).toEqual({
      outcome: 'accepted',
      providerRequestId: null,
      errorClass: null,
      redactedDiagnostic: null
    })
    const [url, request] = fetch.mock.calls[0]!
    expect(url).toBe('https://www.google-analytics.com/mp/collect?measurement_id=G-ABCDEFG123&api_secret=ga4-api-secret')
    expect(JSON.parse(request.body as string)).toEqual({
      client_id: '1234567890.1234567890',
      events: [{ name: 'phone_click', params: {} }]
    })
  })

  it('fails closed without calling fetch when the GA4 client_id is missing', async () => {
    const fetch = vi.fn()

    const result = await deliverGa4MeasurementProtocolEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'phone_click',
        providerEventName: 'phone_click',
        externalDestinationId: 'G-ABCDEFG123',
        attribution: { ...baseDelivery.attribution, gaClientId: null }
      },
      apiSecret: 'ga4-api-secret',
      fetch
    })

    expect(result).toEqual({
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'missing_ga4_client_id',
      redactedDiagnostic: 'GA4 delivery requires a GA4 client ID from the _ga cookie'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('treats a non-2xx response as a provider HTTP failure', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 }))

    const result = await deliverGa4MeasurementProtocolEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'phone_click',
        providerEventName: 'phone_click',
        externalDestinationId: 'G-ABCDEFG123',
        attribution: { ...baseDelivery.attribution, gaClientId: '1234567890.1234567890' }
      },
      apiSecret: 'ga4-api-secret',
      fetch
    })

    expect(result).toEqual({
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'provider_http_500',
      redactedDiagnostic: 'GA4 Measurement Protocol returned HTTP 500'
    })
  })
})
