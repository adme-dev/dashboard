/**
 * Client-360 export: QR touchpoints as first-party tracking events, so a client's dashboards
 * show scan → landing view → lead beside their site visits. No fingerprinting — identity is the
 * QR scan's day-scoped IP hash, and the GA4 client id only when the client's own GA4 tag already
 * set it on the hosted page.
 */
export const QR_360_EVENT_NAMES = ['qr_scan', 'qr_landing_view', 'qr_lead'] as const
export type Qr360EventName = typeof QR_360_EVENT_NAMES[number]

/** GA cookie `GA1.1.1273685222.1787692266` → `1273685222.1787692266`; null when malformed. */
export function parseGaClientId(cookie: string | null | undefined): string | null {
  if (!cookie) return null
  const m = cookie.trim().match(/^GA\d+\.\d+\.(\d+\.\d+)$/)
  return m ? m[1]! : null
}

export interface Qr360RowInput {
  siteId: string
  clientId: string
  eventId: string
  eventName: Qr360EventName
  code: string
  variant?: 'A' | 'B' | null
  ipHash: string | null
  ua?: string | null
  pageUrl?: string | null
  referrer?: string | null
  utm?: { source?: string | null, medium?: string | null, campaign?: string | null, content?: string | null }
  gaClientId?: string | null
  consent?: { tracking?: string, marketing?: string } | null
  leadId?: string | null
  occurredAt: string
}

/** Column-ordered row for tracking_events. Pure so it can be unit-tested without a DB. */
export function buildQr360Row(i: Qr360RowInput) {
  return {
    site_id: i.siteId,
    client_id: i.clientId,
    event_id: i.eventId,
    anon_id: `qr:${i.ipHash ?? 'anon'}`,
    session_id: null as string | null,
    event_name: i.eventName,
    page_url: i.pageUrl ?? null,
    referrer: i.referrer ?? null,
    utm_source: i.utm?.source ?? 'qr',
    utm_medium: i.utm?.medium ?? null,
    utm_campaign: i.utm?.campaign ?? null,
    utm_term: null as string | null,
    utm_content: i.utm?.content ?? i.code,
    gclid: null, gbraid: null, wbraid: null, fbclid: null, fbc: null, fbp: null, ttclid: null, msclkid: null, li_fat_id: null,
    ga_client_id: i.gaClientId ?? null,
    event_data: { xf_qr: i.code, ...(i.variant ? { xf_qr_variant: i.variant } : {}), ...(i.leadId ? { lead_id: i.leadId } : {}), source: 'qr' },
    consent: i.consent ?? null,
    ua: i.ua ? i.ua.slice(0, 512) : null,
    ip_hash: i.ipHash,
    origin: 'qr',
    occurred_at: i.occurredAt
  }
}
