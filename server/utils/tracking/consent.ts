/**
 * server/utils/tracking/consent.ts
 *
 * Snapshot visitor consent at endpoint receive time so it can be stored with
 * each event (and later travel to any server-side fan-out, which otherwise has
 * no access to the request cookie). Without this snapshot, downstream fan-out
 * would fire to ad platforms regardless of consent — a GDPR/Privacy Act risk.
 *
 * Two regimes:
 *   - EU/UK/EEA/CH (per cf-ipcountry): opt-IN. Without the consent cookie, all
 *     three categories default 'denied'. Marketing destinations skipped; GA4
 *     fires Consent Mode v2 deny pings (fan-out side).
 *   - AU + ROW: opt-OUT. Without cookie, `tracking` implicitly granted
 *     (essential); analytics + marketing default deny.
 *
 * Cookie shape: `{ tracking, analytics, marketing, updatedAt }`.
 * `updatedAt: null` is the implicit-consent marker.
 *
 * EU_COUNTRY_CODES is hardcoded (NOT env, NOT KV) so auditors grep one source
 * file. Pure module. ZERO imports. NEVER throws.
 */

/** EU-27 + EEA (IS/NO/LI) + UK + Switzerland — opt-in jurisdictions. cf-ipcountry returns ISO-3166-1 alpha-2 uppercase; Set lookups O(1). */
export const EU_COUNTRY_CODES: ReadonlySet<string> = new Set([
  // EU-27
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  // EEA (non-EU): Iceland, Norway, Liechtenstein
  'IS',
  'NO',
  'LI',
  // UK + Switzerland (opt-in regimes outside EU)
  'GB',
  'CH'
])

/**
 * Frozen consent stored with each event. Categories use string literals (not
 * booleans) so they round-trip through GA4 Consent Mode v2 payloads verbatim.
 * `source` distinguishes explicit consent from EU/AU implicit default. `region`
 * (cf-ipcountry uppercase) lets downstream audit drop rates.
 */
export interface ConsentSnapshot {
  tracking: 'granted' | 'denied'
  analytics: 'granted' | 'denied'
  marketing: 'granted' | 'denied'
  source: 'explicit_cookie' | 'eu_implicit_deny' | 'au_implicit_essential' | 'no_signal'
  region: string | null
  cookieUpdatedAt: string | null
}

/**
 * Parse the consent cookie value. Shape: `{ tracking, analytics, marketing,
 * updatedAt }`. Returns null on absent or malformed input. Never throws.
 */
export function parseConsentCookie(
  cookieValue: string | null | undefined
): { tracking: boolean, analytics: boolean, marketing: boolean, updatedAt: string | null } | null {
  if (!cookieValue) return null
  try {
    const parsed = JSON.parse(cookieValue)
    return {
      tracking: parsed.tracking ?? false,
      analytics: parsed.analytics ?? false,
      marketing: parsed.marketing ?? false,
      updatedAt: parsed.updatedAt ?? null
    }
  } catch {
    return null
  }
}

/**
 * Snapshot the visitor's consent state at endpoint receive time.
 *
 * Four-branch decision (in priority order):
 *   1. **explicit_cookie**: Cookie present with a non-null `updatedAt` →
 *      cookie values win unconditionally. User has interacted with the consent
 *      UI; we respect their choice regardless of region.
 *   2. **eu_implicit_deny**: No usable cookie AND cf-ipcountry is in EU set →
 *      all three categories denied. EU/UK opt-in regime per Pitfall 7.
 *   3. **au_implicit_essential**: No usable cookie AND cf-ipcountry is set
 *      but NOT in EU set → tracking granted (essential), analytics + marketing
 *      denied. AU + ROW opt-out regime.
 *   4. **no_signal**: cf-ipcountry undefined AND no usable cookie →
 *      all three denied. Defensive default (covers test rigs + CF outages).
 *
 * NEVER throws. All inputs are nullable; behaviour fully specified above.
 */
export function snapshotConsent(opts: {
  consentCookieValue: string | null | undefined
  cfIpCountry: string | null | undefined
}): ConsentSnapshot {
  const cookie = parseConsentCookie(opts.consentCookieValue)
  const region = opts.cfIpCountry ? opts.cfIpCountry.toUpperCase() : null

  // Branch 1: explicit cookie wins regardless of region.
  if (cookie && cookie.updatedAt !== null) {
    return {
      tracking: cookie.tracking ? 'granted' : 'denied',
      analytics: cookie.analytics ? 'granted' : 'denied',
      marketing: cookie.marketing ? 'granted' : 'denied',
      source: 'explicit_cookie',
      region,
      cookieUpdatedAt: cookie.updatedAt
    }
  }

  // Branch 2: EU/UK/EEA without explicit consent → opt-in deny.
  if (region && EU_COUNTRY_CODES.has(region)) {
    return {
      tracking: 'denied',
      analytics: 'denied',
      marketing: 'denied',
      source: 'eu_implicit_deny',
      region,
      cookieUpdatedAt: null
    }
  }

  // Branch 3: known non-EU region without explicit consent → AU implicit essential.
  if (region) {
    return {
      tracking: 'granted',
      analytics: 'denied',
      marketing: 'denied',
      source: 'au_implicit_essential',
      region,
      cookieUpdatedAt: null
    }
  }

  // Branch 4: no region signal AND no cookie → safest deny.
  return {
    tracking: 'denied',
    analytics: 'denied',
    marketing: 'denied',
    source: 'no_signal',
    region: null,
    cookieUpdatedAt: null
  }
}

/**
 * Single source of truth for consent → destination mapping, shared by any
 * producer/fan-out path so there is no drift. GA4 needs analytics granted (when
 * denied, fan-out applies Consent Mode v2 deny pings via a separate code path).
 * Meta/TikTok/Google Ads need marketing granted (no Consent Mode equivalent —
 * fan-out drops silently when denied).
 */
export function shouldDestinationFire(
  snapshot: ConsentSnapshot,
  destination: 'ga4' | 'meta' | 'tiktok' | 'google_ads'
): boolean {
  if (destination === 'ga4') return snapshot.analytics === 'granted'
  return snapshot.marketing === 'granted'
}
