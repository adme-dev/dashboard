import type { H3Event } from 'h3'
import { queryOne } from './db'
import type { OfficeMemberRow } from '~~/app/types/office'

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

export type OfficeMediaScope = 'state' | 'publish' | 'pull' | 'renegotiate' | 'close'

export interface OfficeMediaGrantClaims {
  purpose: 'office-media'
  officeId: string
  zoneId: string
  handle: `user:${string}` | `client:${string}`
  sessionId: string
  isGuest: boolean
  guestBadgeId?: string | null
  scopes: OfficeMediaScope[]
  exp: number
}

export interface OfficeRemoteTrackGrantClaims {
  purpose: 'office-remote-track'
  officeId: string
  zoneId: string
  publisherHandle: `user:${string}` | `client:${string}`
  publisherSessionId: string
  trackName: string
  kind: 'audio' | 'video'
  exp: number
}

const OFFICE_MEDIA_SCOPES = new Set<OfficeMediaScope>([
  'state',
  'publish',
  'pull',
  'renegotiate',
  'close'
])

function base64UrlDecode(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function verifyOfficeCapability(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, payload, signature] = parts as [string, string, string]
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    )
    if (!valid) return null
    const parsedHeader = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(header))
    ) as { alg?: unknown, typ?: unknown }
    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') return null

    return JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload))
    ) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function verifyOfficeMediaGrant(
  token: string,
  secret: string
): Promise<OfficeMediaGrantClaims | null> {
  const claims = await verifyOfficeCapability(token, secret) as Partial<OfficeMediaGrantClaims> | null
  if (!claims) return null
  try {
    if (claims.purpose !== 'office-media') return null
    if (typeof claims.officeId !== 'string' || !claims.officeId.trim()) return null
    if (typeof claims.zoneId !== 'string' || !claims.zoneId.trim()) return null
    if (typeof claims.sessionId !== 'string' || !claims.sessionId.trim()) return null
    if (typeof claims.handle !== 'string' || !/^(user|client):.+/.test(claims.handle)) return null
    if (typeof claims.isGuest !== 'boolean') return null
    if (claims.isGuest && !claims.handle.startsWith('client:')) return null
    if (!claims.isGuest && !claims.handle.startsWith('user:')) return null
    if (claims.isGuest && (typeof claims.guestBadgeId !== 'string' || !claims.guestBadgeId.trim())) {
      return null
    }
    if (!Array.isArray(claims.scopes) || claims.scopes.length === 0) return null
    if (!claims.scopes.every(scope => OFFICE_MEDIA_SCOPES.has(scope))) return null
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null
    return claims as OfficeMediaGrantClaims
  } catch {
    return null
  }
}

export async function verifyOfficeRemoteTrackGrant(
  token: string,
  secret: string
): Promise<OfficeRemoteTrackGrantClaims | null> {
  const claims = await verifyOfficeCapability(token, secret) as Partial<OfficeRemoteTrackGrantClaims> | null
  if (!claims) return null
  if (claims.purpose !== 'office-remote-track') return null
  if (typeof claims.officeId !== 'string' || !claims.officeId.trim()) return null
  if (typeof claims.zoneId !== 'string' || !claims.zoneId.trim()) return null
  if (
    typeof claims.publisherHandle !== 'string'
    || !/^(user|client):.+/.test(claims.publisherHandle)
  ) return null
  if (
    typeof claims.publisherSessionId !== 'string'
    || !claims.publisherSessionId.trim()
  ) return null
  if (typeof claims.trackName !== 'string' || !claims.trackName.trim()) return null
  if (claims.kind !== 'audio' && claims.kind !== 'video') return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null
  return claims as OfficeRemoteTrackGrantClaims
}

function getCfOrProcessEnv(event: H3Event, key: string): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.[key] as string | undefined) ?? process.env[key]
}

function guestRealtimeIsEnabled(event: H3Event, officeId: string) {
  if (getCfOrProcessEnv(event, 'OFFICE_GUEST_REALTIME_MEDIA_ENABLED')?.trim().toLowerCase() !== 'true') {
    return false
  }
  return new Set(
    (getCfOrProcessEnv(event, 'OFFICE_GUEST_REALTIME_PILOT_OFFICE_IDS') ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  ).has(officeId)
}

export async function requireOfficeRemoteTrackAccess(
  event: H3Event,
  input: {
    officeId: string
    zoneId: string
    publisherSessionId: string
    trackName: string
    kind: 'audio' | 'video'
    capability: string
  }
) {
  const grantSecret = getCfOrProcessEnv(event, 'OFFICE_SYNC_SECRET')
  if (!grantSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Office media grants are not configured' })
  }
  const grant = await verifyOfficeRemoteTrackGrant(input.capability, grantSecret)
  if (!grant) {
    throw createError({ statusCode: 403, statusMessage: 'Remote track capability is invalid or expired' })
  }
  if (
    grant.officeId !== input.officeId
    || grant.zoneId !== input.zoneId
    || grant.publisherSessionId !== input.publisherSessionId
    || grant.trackName !== input.trackName
    || grant.kind !== input.kind
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Remote track capability scope mismatch' })
  }
  return grant
}

export async function requireOfficeRealtimeAccess(
  event: H3Event,
  options?: { scope: OfficeMediaScope, zoneId: string }
) {
  const officeId = getRouterParam(event, 'officeId')
  const sessionId = getRouterParam(event, 'sessionId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }
  if (!sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'sessionId required' })
  }
  if (!options) {
    throw createError({ statusCode: 500, statusMessage: 'Office media operation scope required' })
  }

  let membership: OfficeMemberRow | null | undefined
  let guestBadge: {
    id: string
    status: string
    expires_at: string
    allowed_zone_id: string | null
  } | null | undefined

  const authorization = getHeader(event, 'authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Office media grant required' })
  }

  const grantSecret = getCfOrProcessEnv(event, 'OFFICE_SYNC_SECRET')
  if (!grantSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Office media grants are not configured' })
  }
  const grant = await verifyOfficeMediaGrant(token, grantSecret) ?? undefined
  if (!grant) {
    throw createError({ statusCode: 401, statusMessage: 'Office media grant is invalid or expired' })
  }
  if (
    grant.officeId !== officeId
    || grant.sessionId !== sessionId
    || grant.zoneId !== options.zoneId
    || !grant.scopes.includes(options.scope)
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Office media grant scope mismatch' })
  }
  if (grant.isGuest) {
    if (!guestRealtimeIsEnabled(event, officeId)) {
      throw createError({ statusCode: 403, statusMessage: 'Guest Realtime media is not enabled' })
    }
    guestBadge = await queryOne(
      `SELECT id, status, expires_at, allowed_zone_id
       FROM office_guest_badges
       WHERE office_id = $1
         AND id = $2`,
      [officeId, grant.guestBadgeId]
    )
    if (
      !guestBadge
      || guestBadge.status !== 'active'
      || new Date(guestBadge.expires_at).getTime() <= Date.now()
      || guestBadge.allowed_zone_id !== grant.zoneId
    ) {
      throw createError({ statusCode: 403, statusMessage: 'Guest media access is no longer active' })
    }
  } else {
    const userId = grant.handle.slice('user:'.length)
    membership = await queryOne<OfficeMemberRow>(
      `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
      [officeId, userId]
    )
    if (!membership) {
      throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
    }
  }

  const appId = getCfOrProcessEnv(event, 'REALTIME_APP_ID')
  const appSecret = getCfOrProcessEnv(event, 'REALTIME_APP_SECRET')
  if (!appId || !appSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Realtime media is not configured' })
  }

  return {
    membership,
    guestBadge,
    grant,
    officeId,
    sessionId,
    appId,
    appSecret
  }
}

export async function requireOfficeRealtimeZone(officeId: string, zoneId: string) {
  const zone = await queryOne<{ id: string }>(
    `SELECT id
     FROM office_zones
     WHERE id = $1
       AND office_id = $2
       AND zone_type <> 'desk'`,
    [zoneId, officeId]
  )
  if (!zone) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting room not found' })
  }
  return zone
}
