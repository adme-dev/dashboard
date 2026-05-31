// server/utils/exportTokens.ts
/**
 * Helpers for the analytics export destination's bearer tokens. Tokens are
 * stored as a sha256 hex hash; the plaintext is returned once at creation.
 * Uses Web Crypto (available on both the Workers runtime and Node 18+).
 */

/** sha256 hex of a string (deterministic — used to look tokens up by hash). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** 32 random bytes as hex — the plaintext export token. */
export function generateExportToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Extract a bearer token from an Authorization header or ?token= query value. */
export function extractToken(authHeader: string | null | undefined, queryToken: string | null | undefined): string | null {
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim() || null
  }
  return (queryToken && String(queryToken).trim()) || null
}
