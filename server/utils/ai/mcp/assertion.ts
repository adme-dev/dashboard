import { parseMcpPageStudioLogin, type McpPageStudioLoginProof } from '~~/shared/utils/mcpPageStudioLogin'
/**
 * MCP Server Phase 1 — OAuth identity handshake (mcp-server-phase1 spec §3, TODO A "reuse app identity").
 *
 * The MCP Worker delegates user authentication to THIS app (the existing login). After the user logs in
 * and consents, the app issues a short-lived HMAC-signed assertion of their `userId`; the Worker hands it
 * back and the app verifies it before the OAuth grant completes. This keeps the identity authority + crypto
 * in ONE place (here, tested) — the Worker never mints or trusts identities on its own.
 *
 * Format: `base64url(JSON{uid,exp}) . base64url(HMAC_SHA256(body, secret))`. Web Crypto only (runs in both
 * Nitro and the Worker). Fail-safe verify: any tampering / expiry / malformed input → null.
 */

const enc = new TextEncoder()

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlEncodeString(str: string): string {
  return b64urlFromBytes(enc.encode(str))
}

function b64urlDecodeToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function hmac(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return b64urlFromBytes(new Uint8Array(sig))
}

/** Constant-time string compare (avoids signature-timing leaks). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const MCP_ASSERTION_TTL_SEC = 120

const STATE_HASH = /^[a-f0-9]{64}$/

/** SHA-256 of the exact OAuth authorization request (`state`) the consent assertion is bound to. */
export async function digestMcpOAuthState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(state))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The verified identity + granted OAuth scope carried by an assertion. */
export interface VerifiedAssertion { uid: string, scope: string[], stateHash?: string, pageStudioLogin?: McpPageStudioLoginProof }

/** Sign `{uid, exp, scp?}` for the authenticated user. `scope` carries the consented OAuth scope (e.g.
 *  ['mcp:read','mcp:write']) from the app's consent screen to the Worker's grant. `now` injected for tests. */
export async function signMcpAssertion(
  userId: string,
  secret: string,
  opts: { scope?: string[], ttlSec?: number, now?: number, stateHash?: string, pageStudioLogin?: McpPageStudioLoginProof } = {}
): Promise<string> {
  const now = opts.now ?? Date.now()
  const exp = Math.floor(now / 1000) + (opts.ttlSec ?? MCP_ASSERTION_TTL_SEC)
  const payload: { uid: string, exp: number, scp?: string[], sth?: string, pageStudioLogin?: McpPageStudioLoginProof } = { uid: userId, exp }
  if (opts.scope && opts.scope.length) payload.scp = opts.scope
  if (opts.stateHash !== undefined) {
    if (!STATE_HASH.test(opts.stateHash)) throw new TypeError('Invalid OAuth state binding')
    payload.sth = opts.stateHash
  }
  if (opts.pageStudioLogin !== undefined) {
    const proof = parseMcpPageStudioLogin(opts.pageStudioLogin, userId)
    if (!proof || proof.issuedAt > now || proof.expiresAt <= now) throw new TypeError('Invalid original Studio login proof')
    payload.pageStudioLogin = proof
  }
  const body = b64urlEncodeString(JSON.stringify(payload))
  const sig = await hmac(body, secret)
  return `${body}.${sig}`
}

/** Verify an assertion → { uid, scope }, or null if tampered / expired / malformed. Never throws.
 *  An assertion with no `scp` (older format) defaults to ['mcp:read'] — read-only, fail-safe. */
export async function verifyMcpAssertion(
  assertion: string,
  secret: string,
  opts: { now?: number } = {}
): Promise<VerifiedAssertion | null> {
  try {
    if (!assertion || !secret) return null
    const [body, sig] = assertion.split('.')
    if (!body || !sig) return null
    const expected = await hmac(body, secret)
    if (!timingSafeEqual(sig, expected)) return null
    const payload = JSON.parse(b64urlDecodeToString(body)) as { uid?: unknown, exp?: unknown, scp?: unknown, sth?: unknown, pageStudioLogin?: unknown }
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return null
    const nowSec = Math.floor((opts.now ?? Date.now()) / 1000)
    if (payload.exp < nowSec) return null
    const scope = Array.isArray(payload.scp) && payload.scp.length && payload.scp.every(s => typeof s === 'string')
      ? payload.scp as string[]
      : ['mcp:read']
    if (payload.sth !== undefined && (typeof payload.sth !== 'string' || !STATE_HASH.test(payload.sth))) return null
    const proof = payload.pageStudioLogin === undefined ? undefined : parseMcpPageStudioLogin(payload.pageStudioLogin, payload.uid)
    if (proof === null || (proof && (proof.issuedAt > (opts.now ?? Date.now()) || proof.expiresAt <= (opts.now ?? Date.now())))) return null
    return { uid: payload.uid, scope, ...(typeof payload.sth === 'string' ? { stateHash: payload.sth } : {}), ...(proof ? { pageStudioLogin: proof } : {}) }
  } catch {
    return null
  }
}
