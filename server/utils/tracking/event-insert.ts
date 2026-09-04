/**
 * Pure transform: validated payload + request context → flat DB rows for
 * tracking_events. No IO. Keeps the endpoint handler thin and testable.
 */
import type { TrackPayload } from './track-schema'
import type { TrackingSite } from './site-config'

export interface EventContext {
  ua: string | null
  ipHash: string | null
  origin: string | null
  consent: unknown
}

export interface TrackingEventRow {
  site_id: string
  client_id: string
  event_id: string
  anon_id: string
  session_id: string | null
  event_name: string
  page_url: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  fbclid: string | null
  fbc: string | null
  fbp: string | null
  ttclid: string | null
  ttp: string | null
  msclkid: string | null
  li_fat_id: string | null
  event_data: Record<string, unknown>
  consent: unknown
  ua: string | null
  ip_hash: string | null
  origin: string | null
  occurred_at: string | null
}

const ATTR_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp', 'ttclid', 'ttp', 'msclkid', 'li_fat_id'
] as const

export function buildEventRows(
  site: Pick<TrackingSite, 'id' | 'clientId'>,
  payload: TrackPayload,
  ctx: EventContext
): TrackingEventRow[] {
  return payload.events.map((ev) => {
    const attr = (ev.attribution ?? {}) as Record<string, string | null | undefined>
    const flat = {} as Record<(typeof ATTR_KEYS)[number], string | null>
    for (const k of ATTR_KEYS) flat[k] = attr[k] ?? null
    const eventData = { ...((ev.event_data ?? {}) as Record<string, unknown>) }
    if (attr.email_click_id && !eventData.email_click_id) {
      eventData.email_click_id = attr.email_click_id
    }
    return {
      site_id: site.id,
      client_id: site.clientId,
      event_id: ev.event_id,
      anon_id: ev.anon_id,
      session_id: ev.session_id ?? null,
      event_name: ev.event_name,
      page_url: ev.page_url ?? null,
      referrer: ev.referrer ?? null,
      ...flat,
      event_data: eventData,
      consent: ctx.consent,
      ua: ctx.ua,
      ip_hash: ctx.ipHash,
      origin: ctx.origin,
      occurred_at: ev.occurred_at ? new Date(ev.occurred_at).toISOString() : null
    }
  })
}
