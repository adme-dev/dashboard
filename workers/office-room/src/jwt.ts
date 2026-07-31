/**
 * Worker-side mirror of server/utils/officeJwt.ts — verifies the JWT minted
 * by the Pages /api/office/:officeId/token endpoint. Same algorithm (HS256
 * via Web Crypto), same payload shape. Kept in-tree so the worker bundle
 * does not need to reach into Nuxt's server/ alias.
 */

import type { ActorHandle, OfficeMemberRole, OfficeZoneAccessPolicy, ZoneType } from '../../../app/types/office'

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

export interface OfficeMediaGrantClaims {
  purpose: 'office-media'
  officeId: string
  zoneId: string
  handle: ActorHandle
  sessionId: string
  isGuest: boolean
  guestBadgeId?: string | null
  scopes: Array<'state' | 'publish' | 'pull' | 'renegotiate' | 'close'>
  exp: number
}

export interface OfficeRemoteTrackGrantClaims {
  purpose: 'office-remote-track'
  officeId: string
  zoneId: string
  publisherHandle: ActorHandle
  publisherSessionId: string
  trackName: string
  kind: 'audio' | 'video'
  exp: number
}

const ROLES = new Set(['admin', 'member', 'guest'])
const ZONE_TYPES = new Set<ZoneType>(['lobby', 'meeting', 'focus', 'theater', 'client_lounge', 'desk'])

function base64UrlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function base64UrlEncode(value: string | ArrayBuffer): string {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

export async function signOfficeMediaGrant(
  claims: OfficeMediaGrantClaims,
  secret: string
) {
  return await signOfficeCapability(claims, secret)
}

export async function signOfficeRemoteTrackGrant(
  claims: OfficeRemoteTrackGrantClaims,
  secret: string
) {
  return await signOfficeCapability(claims, secret)
}

async function signOfficeCapability(
  claims: OfficeMediaGrantClaims | OfficeRemoteTrackGrantClaims,
  secret: string
) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify(claims))
  const data = `${header}.${payload}`
  const key = await importSigningKey(secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  )
  return `${data}.${base64UrlEncode(signature)}`
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseZoneCapacities(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const capacities: Record<string, number> = {}
  for (const [zoneId, rawCapacity] of Object.entries(value)) {
    const capacity = Number(rawCapacity)
    if (zoneId && Number.isFinite(capacity) && capacity > 0) {
      capacities[zoneId] = Math.floor(capacity)
    }
  }
  return capacities
}

function parseZoneAccessPolicies(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const policies: Record<string, OfficeZoneAccessPolicy> = {}
  for (const [zoneId, rawPolicy] of Object.entries(value)) {
    if (!zoneId || !rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) continue
    const policy = rawPolicy as Partial<OfficeZoneAccessPolicy>
    if (typeof policy.zone_type !== 'string' || !ZONE_TYPES.has(policy.zone_type as ZoneType)) continue
    if (typeof policy.is_private !== 'boolean') continue
    const acl = policy.acl && typeof policy.acl === 'object' && !Array.isArray(policy.acl)
      ? policy.acl
      : {}
    policies[zoneId] = {
      zone_type: policy.zone_type as ZoneType,
      is_private: policy.is_private,
      acl: {
        allowed_roles: Array.isArray(acl.allowed_roles)
          ? acl.allowed_roles.filter((role): role is OfficeMemberRole => ROLES.has(role))
          : undefined,
        allowed_clients: Array.isArray(acl.allowed_clients)
          ? acl.allowed_clients.filter((clientId): clientId is string => typeof clientId === 'string')
          : undefined,
        public_lobby: acl.public_lobby === true ? true : undefined
      }
    }
  }
  return policies
}

function validateClaims(value: unknown): OfficeJwtClaims | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const claims = value as Partial<OfficeJwtClaims>
  if (typeof claims.handle !== 'string' || !/^(user|client):.+/.test(claims.handle)) return null
  if (typeof claims.name !== 'string' || !claims.name.trim()) return null
  if (typeof claims.officeId !== 'string' || !claims.officeId.trim()) return null
  if (typeof claims.role !== 'string' || !ROLES.has(claims.role)) return null
  if (typeof claims.isGuest !== 'boolean') return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null
  if (claims.isGuest) {
    if (claims.role !== 'guest') return null
    if (!stringOrNull(claims.guestBadgeId) || !stringOrNull(claims.allowedZoneId)) return null
  } else if (claims.role === 'guest') {
    return null
  }

  return {
    handle: claims.handle,
    name: claims.name,
    avatarUrl: stringOrNull(claims.avatarUrl),
    role: claims.role,
    isGuest: claims.isGuest,
    officeId: claims.officeId,
    allowedZoneId: stringOrNull(claims.allowedZoneId),
    guestBadgeId: stringOrNull(claims.guestBadgeId),
    zoneCapacities: parseZoneCapacities(claims.zoneCapacities),
    zoneAccessPolicies: parseZoneAccessPolicies(claims.zoneAccessPolicies),
    exp: claims.exp
  }
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
  return validateClaims(claims)
}
