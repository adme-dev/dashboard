/**
 * HMAC-SHA256 signed JWT for the Virtual Office WS handshake.
 *
 * The Pages-side /api/office/:officeId/token endpoint mints a short-lived
 * token that the browser presents when opening a WebSocket directly to the
 * office-room worker. The worker has a mirrored verifier at
 * workers/office-room/src/jwt.ts (Web Crypto API; same code on both sides).
 *
 * Why a JWT (rather than cookies): the worker is on a different origin from
 * Pages, and browsers do not send Pages cookies on a WS upgrade to the worker
 * domain. The token carries the verified identity in a signed payload.
 */

import type { ActorHandle, OfficeMemberRole, OfficeZoneAccessPolicy } from '~~/app/types/office'

export interface OfficeJwtClaims {
  handle: ActorHandle
  name: string
  avatarUrl: string | null
  role: OfficeMemberRole
  isGuest: boolean
  officeId: string
  allowedZoneId?: string | null
  guestBadgeId?: string | null
  zoneCapacities?: Record<string, number>
  zoneAccessPolicies?: Record<string, OfficeZoneAccessPolicy>
  /** Unix seconds */
  exp: number
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array
  if (typeof buf === 'string') bytes = new TextEncoder().encode(buf)
  else if (buf instanceof Uint8Array) bytes = buf
  else bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function signOfficeJwt(claims: OfficeJwtClaims, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify(claims))
  const data = `${header}.${payload}`
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${base64UrlEncode(sig)}`
}

export async function verifyOfficeJwt(
  token: string,
  secret: string
): Promise<OfficeJwtClaims | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts as [string, string, string]
  const data = `${header}.${payload}`
  const key = await importKey(secret)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(sig),
    new TextEncoder().encode(data)
  )
  if (!valid) return null
  let claims: OfficeJwtClaims
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as OfficeJwtClaims
  } catch {
    return null
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null
  return claims
}
