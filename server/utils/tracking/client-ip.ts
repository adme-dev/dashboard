/**
 * Resolve the client IP for hashing on the public tracking beacon.
 *
 * The Cloudflare Workers/Pages runtime does NOT populate the source that h3's
 * `getRequestIP` reads, so it returns empty in production — which silently made
 * `ip_hash` NULL for every event since Slice 1 and disabled the rate-limiter's
 * per-IP layer. Cloudflare always sets `cf-connecting-ip`, so it must be the
 * primary source, with getRequestIP kept as a non-CF fallback.
 *
 * Pure + injectable so the precedence is unit-testable (the original inline read
 * was untested, which is why the bug stayed invisible).
 */
export function resolveClientIp(
  cfConnectingIp: string | null | undefined,
  fallbackIp: string | null | undefined,
): string {
  return (cfConnectingIp || fallbackIp || '').trim()
}
