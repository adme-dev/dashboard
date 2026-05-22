/**
 * Shared auth helpers for the internal endpoints that the OfficeRoom DO calls
 * back into Pages with. The DO sends `x-office-sync-secret: $OFFICE_SYNC_SECRET`
 * on every internal request; the endpoints verify it here.
 *
 * Two things are non-trivial:
 *
 * 1. On Cloudflare Pages, env vars live on `event.context.cloudflare.env`,
 *    NOT `process.env`. In local Nitro dev they're on `process.env`. We read
 *    from both so the same code runs in both environments.
 *
 * 2. The secret is HMAC-keyed against office JWTs as well as gating these
 *    endpoints. Use a constant-time comparison so a remote timing-oracle
 *    attack on the comparison can't be amplified into JWT forgery — even
 *    though current consensus is that remote string-equality timing
 *    recovery against a >32-byte random secret over a WAN/edge platform is
 *    not concretely exploitable, the cost of correctness here is zero.
 */
import type { H3Event } from 'h3'

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

export function getOfficeSyncSecret(event: H3Event): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.OFFICE_SYNC_SECRET as string | undefined) ?? process.env.OFFICE_SYNC_SECRET
}

/**
 * Constant-time string equality. Returns false immediately on length
 * mismatch (length is not secret — leaks only the secret's length, which
 * is fixed and operator-known). XOR-accumulates the byte differences over
 * the full string so per-byte short-circuit timing cannot leak the
 * comparison position.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Combined: read the header, read the env secret, constant-time compare.
 * Returns true if the request is authorized, false otherwise.
 */
export function isAuthorizedSyncRequest(event: H3Event, providedHeader: string | undefined): boolean {
  const expected = getOfficeSyncSecret(event)
  if (!expected || !providedHeader) return false
  return timingSafeEqual(providedHeader, expected)
}
