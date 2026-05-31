/**
 * server/utils/tracking/normalize.ts
 *
 * Source-of-truth for PII normalisation across the tracking pipeline.
 * Mirrors composables/useGoogleTagManager.ts:64-93 for browser-side EC parity
 * (Pitfall 5: Google does identity stitching across browser pixel + server fire —
 * both sides MUST normalise identically).
 *
 * Per-destination rules (from .planning/research/PITFALLS.md Pitfall 5 table):
 *   - GA4 / Google Ads: lowercase + trim; for gmail.com/googlemail.com
 *     strip dots and +aliases from local part; phone E.164 with '+'.
 *   - Meta CAPI: lowercase + trim only (NO dot-stripping, NO +alias-stripping);
 *     phone E.164 with '+' (Meta accepts both '+' and digits-only — '+' is
 *     consistent with the audit hash and other CAPI integrations).
 *   - TikTok Events API: lowercase + trim only; phone E.164 with '+'.
 *
 * Pure functions. No imports. No env access. No IO. Never throws.
 */

/** Destination platforms supported by the v1.2 tracking pipeline. */
export type Destination = 'ga4' | 'meta' | 'tiktok' | 'google_ads'

/**
 * Normalise an email address per the destination's published spec.
 *
 * - GA4 / Google Ads: lowercase + trim; for `gmail.com` and `googlemail.com`
 *   addresses, strip dots from the local part AND strip everything from `+`
 *   to `@` (Google Enhanced Conversions spec — verbatim from
 *   composables/useGoogleTagManager.ts:64-76).
 * - Meta / TikTok: lowercase + trim only.
 *
 * Returns empty string for falsy input (no crash, never throws).
 */
export function normalizeEmailForDest(email: string | null | undefined, dest: Destination): string {
  if (!email) return ''
  const lower = email.trim().toLowerCase()
  const atIdx = lower.indexOf('@')
  if (atIdx === -1) return lower

  const domain = lower.slice(atIdx + 1)
  let local = lower.slice(0, atIdx)

  // Google's identity stitching requires Gmail dot/+alias stripping on both
  // browser pixel and server fire. Meta and TikTok docs explicitly say
  // lowercase+trim only, so we MUST NOT apply Gmail rules to those destinations.
  if (dest === 'ga4' || dest === 'google_ads') {
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      const plusIdx = local.indexOf('+')
      if (plusIdx !== -1) local = local.slice(0, plusIdx)
      local = local.replace(/\./g, '')
    }
  }

  return `${local}@${domain}`
}

/**
 * Normalise a phone number to E.164 with leading `+`.
 *
 * Australian heuristics (verbatim from composables/useGoogleTagManager.ts:82-92):
 *   - Leading `0[2-8]` (landline) or `04` (mobile)  → replace `0` with `+61`
 *   - Starts with `61` and ≥11 digits               → prepend `+`
 *   - 9-10 digits without `+`                       → prepend `+61`
 *   - Otherwise non-empty without `+`               → prepend `+`
 *
 * Destination-agnostic: all destinations accept E.164 with `+`. Meta CAPI
 * docs suggest digits-only, but the endpoint accepts both and the rest of
 * the CAPI ecosystem (Meta's own JS SDK) sends `+`. Standardising on E.164
 * keeps the audit hash stable across destinations.
 *
 * Returns empty string for falsy input (no crash, never throws).
 */
export function normalizePhoneE164(phone: string | null | undefined): string {
  if (!phone) return ''

  let cleaned = phone.replace(/[^\d+]/g, '')

  if (/^0[2-8]/.test(cleaned) || /^04/.test(cleaned)) {
    cleaned = '+61' + cleaned.slice(1)
  } else if (cleaned.startsWith('61') && cleaned.length >= 11) {
    cleaned = '+' + cleaned
  } else if (!cleaned.startsWith('+') && cleaned.length >= 9 && cleaned.length <= 10) {
    cleaned = '+61' + cleaned
  }

  if (!cleaned.startsWith('+') && cleaned.length > 0) {
    cleaned = '+' + cleaned
  }

  return cleaned
}
