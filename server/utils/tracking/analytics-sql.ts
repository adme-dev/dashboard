/**
 * Pure helpers for the tracking analytics endpoints. No IO. The SQL-fragment
 * builders return strings to compose into parameterised queries — they never
 * interpolate user input (only fixed column/key names and pre-bound $N refs).
 */

/** Local-day bucket for a timestamptz column, given a bound tz param ref (e.g. '$4'). */
export function dayBucketExpr(tzParamRef: string): string {
  return `(e.received_at AT TIME ZONE ${tzParamRef})::date`
}

/** Regex-guarded numeric extraction from event_data — yields NULL (not an error)
 *  for non-numeric values, so a malformed stored event can't 500 an aggregate. */
export function numericJsonb(key: string): string {
  // key is a fixed literal from our own code, never user input.
  return `CASE WHEN event_data->>'${key}' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (event_data->>'${key}')::numeric END`
}

/** Shared WHERE-noise filter: drop dead_click + obvious bots. Compose with AND. */
export const NOISE_SQL
  = `event_name <> 'dead_click' AND (ua IS NULL OR ua !~* '(bot|crawler|spider|slurp|bingpreview|headless|lighthouse|pingdom|gtmetrix)')`

export interface Attributionish {
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  fbclid?: string | null
  msclkid?: string | null
  ttclid?: string | null
  utm_source?: string | null
  referrer?: string | null
}

const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid'] as const

export function classifyPaidOrganic(row: Attributionish): 'paid' | 'organic' | 'direct' {
  for (const k of CLICK_IDS) if (row[k]) return 'paid'
  if (row.utm_source || row.referrer) return 'organic'
  return 'direct'
}

export interface UaInfo { device: 'mobile' | 'tablet' | 'desktop' | 'unknown', browser: string }

export function classifyUserAgent(ua: string | null | undefined): UaInfo {
  if (!ua) return { device: 'unknown', browser: 'unknown' }
  const isTablet = /\b(iPad|Tablet)\b/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
  const isMobile = !isTablet && /(Mobi|iPhone|iPod|Android.*Mobile|Windows Phone)/i.test(ua)
  const device = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'
  let browser = 'Other'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua)) browser = 'Safari'
  return { device, browser }
}
