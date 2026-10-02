// server/utils/socialOAuth/state.ts
// Pure HMAC-signed state for the OAuth round-trip. No I/O. The token is "<base64url(json)>.<hmacHex>".
// `ts` (ms epoch) is stamped on sign if absent; verify enforces maxAgeMs and a timing-safe signature check.
import { createHmac, timingSafeEqual } from 'node:crypto'

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}
function hmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

export function signState(data: Record<string, any>, secret: string): string {
  const payload = { ...data, ts: data.ts ?? Date.now() }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${hmac(body, secret)}`
}

export function verifyState<T = any>(token: string, secret: string, maxAgeMs: number): T | null {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = hmac(body, secret)
  if (sig.length !== expected.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch { return null }
  let data: any
  try { data = JSON.parse(fromB64url(body).toString('utf8')) } catch { return null }
  // Expiry is mandatory: a payload without a numeric ts is rejected (signState always stamps one).
  if (typeof data?.ts !== 'number' || Date.now() - data.ts > maxAgeMs) return null
  return data as T
}

/** Recovery labels only; NEVER authorizes code exchange or account mutation. */
export function expiredMetaStateContext(token: string, secret: string, maxAgeMs: number): { clientId: string; userId: string } | null {
  if (!secret || token.split('.').length !== 2) return null
  // Verify the signature independently of age, then accept ONLY an expired,
  // schema-valid Meta payload. verifyState remains strict for all OAuth callers.
  const data = verifyState<any>(token, secret, Infinity)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!data || !Number.isFinite(data.ts) || Date.now() - data.ts <= maxAgeMs
    || typeof data.clientId !== 'string' || typeof data.userId !== 'string' || typeof data.nonce !== 'string'
    || data.platform !== 'meta' || !uuid.test(data.clientId) || !uuid.test(data.userId) || !uuid.test(data.nonce)) return null
  return { clientId: data.clientId, userId: data.userId }
}
