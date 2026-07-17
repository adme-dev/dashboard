import { describe, expect, it, vi } from 'vitest'
import {
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
  attribution: {
    browserEventId: 'browser-event-1',
    metaLeadId: '123456789012345',
    gclid: 'gclid-1',
    gbraid: null,
    wbraid: null
  }
}

describe('measurement delivery provider adapters', () => {
  it('sends a Meta CRM event with lead matching and browser-compatible deduplication', async () => {
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
        event_id: 'browser-event-1',
        action_source: 'other',
        user_data: { lead_id: '123456789012345' }
      }]
    })
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
})
