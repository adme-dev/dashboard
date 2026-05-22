/**
 * Worker-side mirror of server/utils/officeJwt.ts — verifies the JWT minted
 * by the Pages /api/office/:officeId/token endpoint. Same algorithm (HS256
 * via Web Crypto), same payload shape. Kept in-tree so the worker bundle
 * does not need to reach into Nuxt's server/ alias.
 */

import type { ActorHandle, OfficeMemberRole } from '../../../app/types/office'

export interface OfficeJwtClaims {
  handle: ActorHandle
  name: string
  avatarUrl: string | null
  role: OfficeMemberRole
  isGuest: boolean
  officeId: string
  /** Unix seconds */
  exp: number
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
    ['verify']
  )
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
