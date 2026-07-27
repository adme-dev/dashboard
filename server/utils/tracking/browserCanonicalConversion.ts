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
  | 'ga_client_id'
>

const PROMOTABLE_EVENT_NAMES = new Set([
  'generate_lead',
  'phone_click',
  'add_to_wishlist',
  'form_submit'
])

export function buildBrowserCanonicalConversion(input: {
  row: BrowserConversionRow
  marketingConsent: 'granted' | 'denied'
  receivedAt: string
}): AppendCanonicalConversionEvent | null {
  if (!PROMOTABLE_EVENT_NAMES.has(input.row.event_name) || input.marketingConsent !== 'granted') {
    return null
  }

  return {
    clientId: input.row.client_id,
    eventName: input.row.event_name === 'generate_lead' ? 'web_conversion' : input.row.event_name,
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
      gaClientId: input.row.ga_client_id
    }
  }
}
