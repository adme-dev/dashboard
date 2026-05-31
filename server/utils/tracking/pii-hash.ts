/**
 * server/utils/tracking/pii-hash.ts
 *
 * Two-tier PII hashing for the tracking pipeline:
 *
 *   1. UNSALTED SHA-256 (`hashForDest` / `hashUserDataForDest`) — emitted to
 *      destinations (Meta CAPI `em[]`, GA4 user_data, TikTok user.email[]).
 *      Required by the destination spec; salting would break Match Quality.
 *
 *   2. PER-TENANT SALTED SHA-256 (`hashForAudit` / `hashUserDataForAudit`) —
 *      written to `conversion_delivery_log.payload_hash`. Salt makes the
 *      audit row non-trivially reversible without compromising destination
 *      Match Quality (Pitfall 8 multi-tenant secret leak design).
 *
 * Per-destination normalisation is composed via ./normalize (Pitfall 5):
 *   - GA4 / Google Ads: Gmail dot/+alias stripping
 *   - Meta / TikTok: lowercase+trim only
 *
 * TRACK-11 invariant: NEVER throws. Hash failures return '' or {} with a
 * console.warn. The audit row gets SOMETHING even if the salt is missing
 * (unsalted hash + warn).
 *
 * Bundle weight: zero npm imports. crypto.subtle is a global on both
 * Cloudflare Workers and Node 19+.
 */

import { normalizeEmailForDest, normalizePhoneE164, type Destination } from './normalize'

/**
 * Raw PII fields the producer endpoint may receive on a conversion event.
 * All optional — caller passes whatever they have.
 */
export interface UserDataInput {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
}

/**
 * Hashed user data for destination payloads. Short keys (`em`, `ph`, `fn`,
 * `ln`) match the Meta CAPI / GA4 user_data spec verbatim.
 * Only present when the input had a non-empty value.
 */
export interface HashedUserData {
  em?: string
  ph?: string
  fn?: string
  ln?: string
}

/**
 * Salted hashes for the conversion_delivery_log audit row. Distinct keys
 * from HashedUserData to prevent accidental cross-use in destination payloads.
 */
export interface AuditUserData {
  emHash?: string
  phHash?: string
}

/**
 * SHA-256 hex digest via the native Web Crypto API. Internal helper.
 *
 * Verbatim copy of composables/useGoogleTagManager.ts:51-58 so that browser
 * pixel and server fire produce identical digests (Pitfall 5 identity
 * stitching). Returns '' on falsy input or crypto failure.
 */
async function sha256Hex(value: string): Promise<string> {
  if (!value) return ''
  try {
    const encoder = new TextEncoder()
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(value))
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } catch (err) {
    console.warn('[tracking/pii-hash] sha256Hex failed:', err)
    return ''
  }
}

/**
 * Normalise a name field (firstName / lastName) for hashing.
 * Lowercase + trim + strip non-alphanumerics. Per Meta CAPI / GA4 spec.
 */
function normalizeName(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Public unsalted hash. Used for:
 *   - Destination payloads (Meta CAPI em[], GA4 user_data, TikTok user.email[])
 *   - The producer endpoint's payloadHash audit column where the input is
 *     JSON.stringify of event metadata (NOT PII — no salt needed there).
 *
 * Returns '' for falsy input. Never throws.
 */
export async function hashForDest(value: string): Promise<string> {
  return sha256Hex(value)
}

/**
 * Per-tenant salted hash for the audit log. Salt is appended with a `:`
 * separator (simpler than full HMAC; this is an internal de-dup hint, not
 * a cryptographic primitive).
 *
 * TRACK-11 invariant: never throws. If `tenantSalt` is missing, falls back
 * to an unsalted hash with a console.warn so the audit row still gets a
 * payload_hash value. Per MEMORY.md never rotate salt mid-tenant — it
 * breaks audit hash continuity.
 *
 * Returns '' for empty input.
 */
export async function hashForAudit(
  value: string,
  tenantSalt: string | null | undefined
): Promise<string> {
  if (!value) return ''
  if (!tenantSalt) {
    console.warn(
      '[tracking/pii-hash] hashForAudit called without tenantSalt — emitting unsalted hash'
    )
    return sha256Hex(value)
  }
  return sha256Hex(value + ':' + tenantSalt)
}

/**
 * High-level wrapper for destination payloads. Per-destination email
 * normalisation (Gmail stripping for ga4/google_ads only), universal E.164
 * phone, alphanumeric-only name normalisation. Hashes via `hashForDest`
 * (unsalted).
 *
 * 2-arg signature — salt is exclusively applied via hashUserDataForAudit.
 * Returns only the keys that had non-empty hashed values. Never throws.
 */
export async function hashUserDataForDest(
  userData: UserDataInput,
  dest: Destination
): Promise<HashedUserData> {
  try {
    const result: HashedUserData = {}
    if (userData.email) {
      const h = await hashForDest(normalizeEmailForDest(userData.email, dest))
      if (h) result.em = h
    }
    if (userData.phone) {
      const h = await hashForDest(normalizePhoneE164(userData.phone))
      if (h) result.ph = h
    }
    if (userData.firstName) {
      const h = await hashForDest(normalizeName(userData.firstName))
      if (h) result.fn = h
    }
    if (userData.lastName) {
      const h = await hashForDest(normalizeName(userData.lastName))
      if (h) result.ln = h
    }
    return result
  } catch (err) {
    console.warn('[tracking/pii-hash] hashUserDataForDest failed:', err)
    return {}
  }
}

/**
 * High-level wrapper for the conversion_delivery_log audit row. Uses Meta's
 * lowest-common-denominator email normalisation (lowercase+trim, NO Gmail
 * stripping) so the audit hash is stable across destinations — every
 * destination's normalised email starts from the same base for the audit
 * variant.
 *
 * Hashes via `hashForAudit` (per-tenant salted). Never throws.
 */
export async function hashUserDataForAudit(
  userData: UserDataInput,
  tenantSalt: string | null | undefined
): Promise<AuditUserData> {
  try {
    const result: AuditUserData = {}
    if (userData.email) {
      const h = await hashForAudit(normalizeEmailForDest(userData.email, 'meta'), tenantSalt)
      if (h) result.emHash = h
    }
    if (userData.phone) {
      const h = await hashForAudit(normalizePhoneE164(userData.phone), tenantSalt)
      if (h) result.phHash = h
    }
    return result
  } catch (err) {
    console.warn('[tracking/pii-hash] hashUserDataForAudit failed:', err)
    return {}
  }
}
