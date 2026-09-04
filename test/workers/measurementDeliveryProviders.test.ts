import { describe, expect, it, vi } from 'vitest'
import {
  deliverGoogleDataManagerEvent,
  deliverMetaConversionEvent,
  deliverTikTokEvent,
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
  attribution: {
    browserEventId: null,
    metaLeadId: '123456789012345',
    gclid: 'gclid-1',
    gbraid: null,
    wbraid: null,
    fbc: null,
    fbp: null,
    ttclid: null,
    ttp: null,
    eventSourceUrl: null,
    clientUserAgent: null
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

  it('sends a TikTok Events API 2.0 web event with browser deduplication and match context', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      message: 'OK',
      request_id: 'tiktok-request-1',
      data: {}
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'lead_created',
        providerEventName: 'SubmitForm',
        externalDestinationId: 'C1234567890',
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          ttclid: 'click-1',
          ttp: 'browser-1',
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
          clientUserAgent: 'Test Browser'
        }
      },
      accessToken: 'tiktok-access-token',
      environment: 'test',
      testEventCode: 'TEST123456',
      fetch
    })

    expect(result).toEqual({
      outcome: 'accepted',
      providerRequestId: 'tiktok-request-1',
      errorClass: null,
      redactedDiagnostic: null
    })
    const [url, request] = fetch.mock.calls[0]!
    expect(url).toBe('https://business-api.tiktok.com/open_api/v1.3/event/track/')
    expect(request.headers).toEqual({
      'Access-Token': 'tiktok-access-token',
      'Content-Type': 'application/json'
    })
    expect(JSON.parse(request.body as string)).toEqual({
      event_source: 'web',
      event_source_id: 'C1234567890',
      test_event_code: 'TEST123456',
      data: [{
        event: 'SubmitForm',
        event_time: 1784268000,
        event_id: 'browser-event-1',
        user: {
          ttclid: 'click-1',
          ttp: 'browser-1',
          user_agent: 'Test Browser'
        },
        page: {
          url: 'https://www.werribeetoyota.com.au/enquire'
        }
      }]
    })
  })

  it('refuses TikTok delivery without a browser event ID', async () => {
    const fetch = vi.fn()

    await expect(deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: null,
          ttclid: 'click-1',
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
        }
      },
      accessToken: 'tiktok-access-token',
      fetch
    })).resolves.toMatchObject({
      outcome: 'permanent_failure',
      errorClass: 'missing_tiktok_event_id'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retries TikTok delivery while browser match context is still arriving', async () => {
    const fetch = vi.fn()

    await expect(deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          ttclid: null,
          ttp: null,
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
        }
      },
      accessToken: 'tiktok-access-token',
      fetch
    })).resolves.toMatchObject({
      outcome: 'retryable',
      errorClass: 'tiktok_browser_context_unavailable'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses TikTok delivery with an invalid canonical timestamp', async () => {
    const fetch = vi.fn()

    await expect(deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        occurredAt: 'not-a-timestamp',
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          ttclid: 'click-1',
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
        }
      },
      accessToken: 'tiktok-access-token',
      fetch
    })).resolves.toMatchObject({
      outcome: 'permanent_failure',
      errorClass: 'invalid_event_timestamp'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses to attach a TikTok Test Events code to live delivery', async () => {
    const fetch = vi.fn()

    await expect(deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          ttclid: 'click-1',
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
        }
      },
      accessToken: 'tiktok-access-token',
      environment: 'live',
      testEventCode: 'TEST123456',
      fetch
    })).resolves.toMatchObject({
      outcome: 'permanent_failure',
      errorClass: 'tiktok_test_code_live_forbidden'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [429, 'retryable'],
    [500, 'retryable'],
    [401, 'permanent_failure']
  ] as const)('classifies TikTok HTTP %s as %s', async (status, outcome) => {
    const fetch = vi.fn(async () => new Response('provider detail must not escape', { status }))

    await expect(deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          ttclid: 'click-1',
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
        }
      },
      accessToken: 'tiktok-access-token',
      fetch
    })).resolves.toEqual({
      outcome,
      providerRequestId: null,
      errorClass: `provider_http_${status}`,
      redactedDiagnostic: `TikTok Events API returned HTTP ${status}`
    })
  })

  it('retries a malformed TikTok success response without retaining response content', async () => {
    const fetch = vi.fn(async () => new Response('credential-bearing malformed response', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    }))

    const result = await deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          ttp: 'browser-1',
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
        }
      },
      accessToken: 'tiktok-access-token',
      fetch
    })

    expect(result).toEqual({
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'tiktok_response_invalid',
      redactedDiagnostic: 'TikTok Events API returned an invalid response'
    })
    expect(JSON.stringify(result)).not.toContain('credential-bearing')
  })

  it('classifies a TikTok API-level rejection even when HTTP succeeds', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      code: 40002,
      message: 'provider detail must not escape',
      request_id: 'tiktok-rejected-1'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          ttclid: 'click-1',
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
        }
      },
      accessToken: 'tiktok-access-token',
      fetch
    })).resolves.toEqual({
      outcome: 'permanent_failure',
      providerRequestId: 'tiktok-rejected-1',
      errorClass: 'tiktok_api_40002',
      redactedDiagnostic: 'TikTok Events API rejected the event'
    })
  })

  it('truncates the TikTok provider request ID retained in the receipt', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      message: 'OK',
      request_id: 'r'.repeat(300)
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await deliverTikTokEvent({
      delivery: {
        ...baseDelivery,
        attribution: {
          ...baseDelivery.attribution,
          browserEventId: 'browser-event-1',
          ttclid: 'click-1',
          eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire'
        }
      },
      accessToken: 'tiktok-access-token',
      fetch
    })

    expect(result.outcome).toBe('accepted')
    expect(result.providerRequestId).toHaveLength(255)
  })
})
