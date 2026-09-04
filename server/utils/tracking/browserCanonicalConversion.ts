import type { AppendCanonicalConversionEvent } from '~~/server/utils/measurement/contracts'
import type { TrackingEventRow } from '~~/server/utils/tracking/event-insert'

type BrowserConversionRow = Pick<
  TrackingEventRow,
  | 'site_id'
  | 'client_id'
  | 'event_id'
  | 'event_name'
  | 'occurred_at'
  | 'gclid'
  | 'gbraid'
  | 'wbraid'
  | 'fbc'
  | 'fbp'
  | 'ttclid'
  | 'ttp'
  | 'page_url'
  | 'ua'
>

function safeEventSourceUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const safeUrl = `${url.origin}${url.pathname}`
    return safeUrl.length <= 2048 ? safeUrl : null
  } catch {
    return null
  }
}

function safeUserAgent(value: string | null): string | null {
  const candidate = value?.trim()
  return candidate ? candidate.slice(0, 1024) : null
}

export function buildBrowserCanonicalConversion(input: {
  row: BrowserConversionRow
  marketingConsent: 'granted' | 'denied'
  receivedAt: string
}): AppendCanonicalConversionEvent | null {
  if (input.row.event_name !== 'generate_lead' || input.marketingConsent !== 'granted') {
    return null
  }

  return {
    clientId: input.row.client_id,
    eventName: 'web_conversion',
    sourceSystem: 'browser',
    sourceEntityType: 'tracking_event',
    sourceEntityId: input.row.event_id,
    sourceEventId: `tracking:${input.row.site_id}:${input.row.event_id}`,
    occurredAt: input.row.occurred_at ?? input.receivedAt,
    consentDecision: 'granted',
    attribution: {
      browserEventId: input.row.event_id,
      metaLeadId: null,
      gclid: input.row.gclid,
      gbraid: input.row.gbraid,
      wbraid: input.row.wbraid,
      fbc: input.row.fbc,
      fbp: input.row.fbp,
      ttclid: input.row.ttclid,
      ttp: input.row.ttp,
      gaClientId: null,
      eventSourceUrl: safeEventSourceUrl(input.row.page_url),
      clientUserAgent: safeUserAgent(input.row.ua)
    }
  }
}
