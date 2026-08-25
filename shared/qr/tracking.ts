/**
 * Appends campaign tagging to a QR destination so the client's own analytics (GA4, Meta Pixel,
 * XeroFlow track.js) attribute the visit to the printed code. Adds nothing the URL already has,
 * so a client who hand-tagged their destination keeps their values.
 *
 *   utm_source=qr · utm_medium=<medium> · utm_campaign=<slug of folder|name> · utm_content=<code>
 *   xf_qr=<code>  (click id — survives even when the client overrides the utm_* on their forms)
 */
export const QR_UTM_MEDIUMS = ['print', 'signage', 'vehicle', 'packaging', 'event', 'tv', 'social', 'other'] as const
export type QrUtmMedium = typeof QR_UTM_MEDIUMS[number]
export const QR_CLICK_ID = 'xf_qr'
export const QR_DEFAULT_SOURCE = 'qr'
/** utm_source values are lowercase slugs so GA4 groups them cleanly. */
export function normaliseUtmSource(value: string | null | undefined): string {
  return slugifyCampaign(value) || QR_DEFAULT_SOURCE
}

export interface QrTrackingInput {
  code: string
  enabled: boolean
  medium?: string | null
  campaign?: string | null
  /** Overrides the default 'qr' source, e.g. 'tv' or 'instagram'. */
  source?: string | null
}

export function slugifyCampaign(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function buildTrackedUrl(destination: string, t: QrTrackingInput): string {
  if (!t.enabled) return destination
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return destination
  }
  const p = url.searchParams
  const setIfMissing = (k: string, v: string) => { if (v && !p.has(k)) p.set(k, v) }
  setIfMissing('utm_source', normaliseUtmSource(t.source))
  setIfMissing('utm_medium', (t.medium || 'print').trim().toLowerCase())
  setIfMissing('utm_campaign', slugifyCampaign(t.campaign) || t.code)
  setIfMissing('utm_content', t.code)
  setIfMissing(QR_CLICK_ID, t.code)
  return url.toString()
}
