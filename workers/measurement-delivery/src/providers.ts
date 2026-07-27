export interface MeasurementProviderDelivery {
  eventId: string
  eventName: string
  providerEventName: string
  occurredAt: string
  idempotencyKey: string
  externalDestinationId: string
  operatingAccountId: string
  loginAccountId: string
  metaDeliveryMode: 'crm' | 'web'
  value: number | null
  currency: string | null
  attribution: {
    browserEventId: string | null
    metaLeadId: string | null
    gclid: string | null
    gbraid: string | null
    wbraid: string | null
    fbc: string | null
    fbp: string | null
    eventSourceUrl: string | null
    clientUserAgent: string | null
    gaClientId: string | null
  }
}

const META_CRM_LEAD_EVENT_SOURCE = 'XeroFlow'

export interface ProviderDeliveryResult {
  outcome: 'accepted' | 'retryable' | 'permanent_failure'
  providerRequestId: string | null
  errorClass: string | null
  redactedDiagnostic: string | null
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface MetaDeliveryInput {
  delivery: MeasurementProviderDelivery
  accessToken: string
  graphApiVersion: string
  environment?: 'test' | 'live'
  testEventCode?: string
  fetch: FetchLike
}

export interface GoogleDeliveryInput {
  delivery: MeasurementProviderDelivery
  accessToken: string
  validateOnly?: boolean
  fetch: FetchLike
}

export interface RefreshGoogleAccessTokenInput {
  refreshToken: string
  clientId: string
  clientSecret: string
  fetch: FetchLike
}

export class GoogleOAuthRefreshError extends Error {
  readonly status: number
  readonly retryable: boolean

  constructor(status: number) {
    super('Google OAuth refresh failed')
    this.name = 'GoogleOAuthRefreshError'
    this.status = status
    this.retryable = status === 408 || status === 429 || status >= 500
  }
}

function httpFailure(provider: string, status: number): ProviderDeliveryResult {
  const retryable = status === 408 || status === 429 || status >= 500
  return {
    outcome: retryable ? 'retryable' : 'permanent_failure',
    providerRequestId: null,
    errorClass: `provider_http_${status}`,
    redactedDiagnostic: `${provider} returned HTTP ${status}`
  }
}

async function responseObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json()
    return typeof value === 'object' && value !== null
      ? value as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function requestHeaders(accessToken: string): Record<string, string> {
  return {
    'authorization': `Bearer ${accessToken}`,
    'content-type': 'application/json'
  }
}

export async function deliverMetaConversionEvent(
  input: MetaDeliveryInput
): Promise<ProviderDeliveryResult> {
  const { delivery } = input
  if (input.testEventCode && (input.environment ?? 'live') !== 'test') {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'meta_test_code_live_forbidden',
      redactedDiagnostic: 'Meta Test Events codes are restricted to test delivery'
    }
  }
  if (input.testEventCode && !/^[a-z0-9_-]{4,128}$/i.test(input.testEventCode)) {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'invalid_meta_test_event_code',
      redactedDiagnostic: 'Meta Test Events code is not valid'
    }
  }
  if (delivery.metaDeliveryMode === 'crm' && !delivery.attribution.metaLeadId) {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'missing_meta_match_key',
      redactedDiagnostic: 'Meta delivery requires a Meta lead ID'
    }
  }
  if (
    delivery.metaDeliveryMode === 'web'
    && (
      !delivery.attribution.browserEventId
      || (!delivery.attribution.fbc && !delivery.attribution.fbp)
      || !delivery.attribution.eventSourceUrl
    )
  ) {
    return {
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'meta_web_context_unavailable',
      redactedDiagnostic: 'Meta Web CAPI browser context is not available yet'
    }
  }
  if (!/^v\d+\.\d+$/.test(input.graphApiVersion)) {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'invalid_meta_api_version',
      redactedDiagnostic: 'Meta Graph API version is not configured correctly'
    }
  }

  const occurredAt = new Date(delivery.occurredAt)
  if (!Number.isFinite(occurredAt.getTime())) {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'invalid_event_timestamp',
      redactedDiagnostic: 'Canonical event timestamp is invalid'
    }
  }

  const isWeb = delivery.metaDeliveryMode === 'web'
  const userData = isWeb
    ? {
        ...(delivery.attribution.fbc ? { fbc: delivery.attribution.fbc } : {}),
        ...(delivery.attribution.fbp ? { fbp: delivery.attribution.fbp } : {}),
        ...(delivery.attribution.clientUserAgent
          ? { client_user_agent: delivery.attribution.clientUserAgent }
          : {})
      }
    : { lead_id: delivery.attribution.metaLeadId }
  const response = await input.fetch(
    `https://graph.facebook.com/${input.graphApiVersion}/${encodeURIComponent(delivery.externalDestinationId)}/events`,
    {
      method: 'POST',
      headers: requestHeaders(input.accessToken),
      body: JSON.stringify({
        data: [{
          event_name: delivery.providerEventName,
          event_time: Math.floor(occurredAt.getTime() / 1000),
          event_id: isWeb ? delivery.attribution.browserEventId : delivery.eventId,
          action_source: isWeb ? 'website' : 'system_generated',
          ...(isWeb ? { event_source_url: delivery.attribution.eventSourceUrl } : {}),
          user_data: userData,
          ...(!isWeb
            ? {
                custom_data: {
                  // Required Conversion Leads CRM markers. Website CAPI events
                  // intentionally do not use this payload contract.
                  // https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration
                  lead_event_source: META_CRM_LEAD_EVENT_SOURCE,
                  event_source: 'crm',
                  // Web-mode CAPI events never carry a value: the only valued event type
                  // (lead_won) always resolves to CRM mode by design (see !isWeb above). A
                  // future valued web-sourced event type would need this handled in the
                  // isWeb branch too.
                  ...(delivery.value != null ? { value: delivery.value, currency: delivery.currency } : {})
                }
              }
            : {})
        }],
        ...(input.testEventCode ? { test_event_code: input.testEventCode } : {})
      })
    }
  )
  if (!response.ok) return httpFailure('Meta Conversions API', response.status)

  const body = await responseObject(response)
  const providerRequestId = typeof body.fbtrace_id === 'string'
    ? body.fbtrace_id.slice(0, 255)
    : response.headers.get('x-fb-trace-id')?.slice(0, 255) ?? null
  return {
    outcome: 'accepted',
    providerRequestId,
    errorClass: null,
    redactedDiagnostic: null
  }
}

export async function deliverGoogleDataManagerEvent(
  input: GoogleDeliveryInput
): Promise<ProviderDeliveryResult> {
  const { delivery } = input
  const adIdentifiers = delivery.attribution.gclid
    ? { gclid: delivery.attribution.gclid }
    : delivery.attribution.gbraid
      ? { gbraid: delivery.attribution.gbraid }
      : delivery.attribution.wbraid
        ? { wbraid: delivery.attribution.wbraid }
        : null
  if (!adIdentifiers) {
    if (delivery.attribution.browserEventId) {
      return {
        outcome: 'retryable',
        providerRequestId: null,
        errorClass: 'google_browser_context_unavailable',
        redactedDiagnostic: 'Google browser match context is not available yet'
      }
    }
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'missing_google_match_key',
      redactedDiagnostic: 'Google delivery requires gclid, gbraid or wbraid'
    }
  }

  const response = await input.fetch('https://datamanager.googleapis.com/v1/events:ingest', {
    method: 'POST',
    headers: requestHeaders(input.accessToken),
    body: JSON.stringify({
      destinations: [{
        operatingAccount: {
          accountType: 'GOOGLE_ADS',
          accountId: delivery.operatingAccountId
        },
        loginAccount: {
          accountType: 'GOOGLE_ADS',
          accountId: delivery.loginAccountId
        },
        productDestinationId: delivery.externalDestinationId
      }],
      encoding: 'HEX',
      events: [{
        adIdentifiers,
        eventTimestamp: delivery.occurredAt,
        // Google Data Manager uses transactionId to deduplicate a tag event and
        // an additional API source. Browser-paired events therefore reuse the
        // browser ID; server-only lifecycle events keep the canonical key.
        // Source: https://developers.google.com/data-manager/api/devguides/events/send-events
        transactionId: delivery.attribution.browserEventId ?? delivery.idempotencyKey,
        eventSource: 'WEB',
        ...(delivery.value != null ? { conversionValue: delivery.value, currency: delivery.currency } : {})
      }],
      validateOnly: input.validateOnly ?? false
    })
  })
  if (!response.ok) return httpFailure('Google Data Manager', response.status)

  const body = await responseObject(response)
  if (input.validateOnly) {
    return {
      outcome: 'accepted',
      providerRequestId: null,
      errorClass: null,
      redactedDiagnostic: null
    }
  }
  if (typeof body.requestId !== 'string' || body.requestId.length === 0) {
    return {
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'google_request_id_missing',
      redactedDiagnostic: 'Google Data Manager did not return a request ID'
    }
  }
  return {
    outcome: 'accepted',
    providerRequestId: body.requestId.slice(0, 255),
    errorClass: null,
    redactedDiagnostic: null
  }
}

export interface Ga4DeliveryInput {
  delivery: MeasurementProviderDelivery
  apiSecret: string
  fetch: FetchLike
}

export async function deliverGa4MeasurementProtocolEvent(
  input: Ga4DeliveryInput
): Promise<ProviderDeliveryResult> {
  const { delivery } = input
  if (!delivery.attribution.gaClientId) {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'missing_ga4_client_id',
      redactedDiagnostic: 'GA4 delivery requires a GA4 client ID from the _ga cookie'
    }
  }

  const response = await input.fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(delivery.externalDestinationId)}&api_secret=${encodeURIComponent(input.apiSecret)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: delivery.attribution.gaClientId,
        events: [{
          name: delivery.providerEventName,
          params: {}
        }]
      })
    }
  )
  if (!response.ok) return httpFailure('GA4 Measurement Protocol', response.status)

  // GA4 Measurement Protocol returns 204 No Content on essentially every
  // request, including malformed ones — there is no reliable way to detect
  // GA4-side rejection at delivery time. A 2xx here means "accepted the HTTP
  // request," not "GA4 validated the event." See the design doc's Error
  // Handling section — this is a documented API limitation, not a gap here.
  return {
    outcome: 'accepted',
    providerRequestId: null,
    errorClass: null,
    redactedDiagnostic: null
  }
}

export interface Ga4ValidationInput {
  delivery: MeasurementProviderDelivery
  apiSecret: string
  gaClientId: string
  fetch: FetchLike
}

interface Ga4ValidationMessage {
  description?: string
  validationCode?: string
}

/**
 * GA4's production /mp/collect returns 204 for essentially every request,
 * including malformed ones, so it yields no validation signal. /debug/mp/collect
 * returns a validationMessages array and is the only place GA4 gives a real
 * verdict — which makes this strictly more informative than GA4 delivery.
 */
export async function validateGa4MeasurementProtocolEvent(
  input: Ga4ValidationInput
): Promise<ProviderDeliveryResult> {
  const { delivery } = input
  const response = await input.fetch(
    `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(delivery.externalDestinationId)}&api_secret=${encodeURIComponent(input.apiSecret)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: input.gaClientId,
        events: [{
          name: delivery.providerEventName,
          params: {}
        }]
      })
    }
  )
  if (!response.ok) return httpFailure('GA4 Measurement Protocol debug', response.status)

  let messages: Ga4ValidationMessage[]
  try {
    const body = await response.json() as { validationMessages?: Ga4ValidationMessage[] }
    messages = Array.isArray(body?.validationMessages) ? body.validationMessages : []
  } catch {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'ga4_validation_unreadable',
      redactedDiagnostic: 'GA4 debug endpoint returned an unreadable response'
    }
  }

  if (messages.length > 0) {
    const first = messages[0]
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'ga4_validation_failed',
      redactedDiagnostic: (first?.description ?? 'GA4 rejected the event payload').slice(0, 1000)
    }
  }

  return {
    outcome: 'accepted',
    providerRequestId: null,
    errorClass: null,
    redactedDiagnostic: null
  }
}

export async function refreshGoogleDataManagerAccessToken(
  input: RefreshGoogleAccessTokenInput
): Promise<string> {
  const response = await input.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'refresh_token'
    }).toString()
  })
  if (!response.ok) throw new GoogleOAuthRefreshError(response.status)
  const body = await responseObject(response)
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new Error('Google OAuth response did not contain an access token')
  }
  return body.access_token
}
