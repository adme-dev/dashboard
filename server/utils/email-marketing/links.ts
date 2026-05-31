// server/utils/email-marketing/links.ts
/**
 * Stateless, HMAC-signed tokens for the public email links (unsubscribe +
 * double-opt-in confirm). The link carries the ids it acts on (campaign /
 * subscriber / list) in the clear plus a signature over those ids, so the
 * unauthenticated public endpoints can act without a session cookie while
 * still rejecting tampered or guessed ids (an IDOR guard — without the
 * signature anyone could unsubscribe any subscriber by id).
 *
 * Tokens are purpose-scoped so an `unsub` token can never be replayed as a
 * `confirm` token. Uses Web Crypto (available on the Workers runtime and
 * Node 18+) — mirrors the SHA-256 pattern in exportTokens.ts.
 */

export type EmailLinkPurpose = 'unsub' | 'confirm'

/**
 * The signing secret. Dedicated env var so rotating it doesn't disturb other
 * subsystems; falls back to CRON_SECRET (always set in deployed envs) and then
 * to a fixed dev string so local/test runs work without configuration. The
 * sender and the verifying endpoint both read this, so they always agree.
 */
export function emailLinkSecret(): string {
  return process.env.EMAIL_LINK_SECRET
    || process.env.CRON_SECRET
    || 'dev-insecure-email-link-secret'
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time compare of two equal-length lowercase-hex strings. Returns
// false immediately on a length mismatch (length is not secret here).
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Sign `purpose` + ids into a 128-bit (32 hex char) token. 128 bits is ample
 * forgery resistance for a link that already carries the ids it signs.
 */
export async function signEmailToken(
  secret: string,
  purpose: EmailLinkPurpose,
  ...parts: string[]
): Promise<string> {
  const message = [purpose, ...parts].join(':')
  return (await hmacHex(secret, message)).slice(0, 32)
}

/** Verify a token against the expected purpose + ids in constant time. */
export async function verifyEmailToken(
  secret: string,
  token: string | null | undefined,
  purpose: EmailLinkPurpose,
  ...parts: string[]
): Promise<boolean> {
  if (!token || typeof token !== 'string') return false
  const expected = await signEmailToken(secret, purpose, ...parts)
  return timingSafeHexEqual(token, expected)
}
