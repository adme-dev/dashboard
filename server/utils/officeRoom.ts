import type {
  ActorHandle,
  ActorRef,
  ActorType,
  OfficeMemberRow,
  OfficeZoneRow
} from '~~/app/types/office'

// =============================================================================
// DO accessor
// =============================================================================

import type { H3Event } from 'h3'

// =============================================================================
// Admin guard
// =============================================================================

import { queryOne } from './db'
import { requireAuth, type User } from './auth'

// =============================================================================
// ActorHandle helpers
// =============================================================================

export function toActorHandle(
  actor: { id: string },
  type: ActorType
): ActorHandle {
  if (!actor?.id) throw new Error('toActorHandle: missing id')
  return `${type}:${actor.id}` as ActorHandle
}

export function parseActorHandle(h: ActorHandle): ActorRef {
  const m = /^(user|client):(.+)$/.exec(h)
  if (!m || !m[2]) throw new Error(`parseActorHandle: malformed handle "${h}"`)
  return { type: m[1] as ActorType, id: m[2], handle: h }
}

export function isUserHandle(h: string): h is `user:${string}` {
  return h.startsWith('user:') && h.length > 'user:'.length
}

export function isClientHandle(h: string): h is `client:${string}` {
  return h.startsWith('client:') && h.length > 'client:'.length
}

// =============================================================================
// ACL evaluation
// =============================================================================

export interface AclInput {
  actor: ActorRef
  zone: OfficeZoneRow
  membership: OfficeMemberRow | null
  /** For client actors, the id of the client (company) account they belong to. */
  actorClientId?: string
}

export type AclResult
  = | { allowed: true, reason?: undefined }
    | { allowed: false, reason: string }

export function evaluateAcl(input: AclInput): AclResult {
  const { actor, zone, membership, actorClientId } = input

  // Special case: public_lobby — anyone with membership can enter
  if (zone.zone_type === 'lobby' && zone.acl?.public_lobby === true && membership) {
    return { allowed: true }
  }

  if (!membership) {
    return { allowed: false, reason: 'no office membership' }
  }

  // Client path
  if (actor.type === 'client') {
    const allowedClients = zone.acl?.allowed_clients ?? []
    if (allowedClients.length === 0) {
      return { allowed: false, reason: 'zone not in client allow-list' }
    }
    if (!actorClientId) {
      return { allowed: false, reason: 'client_id required for ACL check' }
    }
    if (!allowedClients.includes(actorClientId)) {
      return { allowed: false, reason: 'client not in allow-list' }
    }
    return { allowed: true }
  }

  // Staff path
  if (!zone.is_private) {
    return { allowed: true }
  }

  const allowedRoles = zone.acl?.allowed_roles ?? []
  if (allowedRoles.length === 0) {
    // Private zone with no allow-list: admin-only by default
    return membership.role === 'admin'
      ? { allowed: true }
      : { allowed: false, reason: 'private zone admin-only' }
  }
  if (!allowedRoles.includes(membership.role)) {
    return { allowed: false, reason: `role ${membership.role} not in zone allow-list` }
  }
  return { allowed: true }
}

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

interface OfficeRoomsBinding {
  idFromName: (name: string) => unknown
  get: (id: unknown) => { fetch: (req: Request) => Promise<Response> }
}

const PLATFORM_OFFICE_ADMIN_ROLES = new Set(['owner', 'admin', 'super_admin'])

export function isPlatformOfficeAdminRole(role: string | null | undefined) {
  return Boolean(role && PLATFORM_OFFICE_ADMIN_ROLES.has(role))
}

export function canAdministerOffice(
  user: Pick<User, 'role'>,
  membership: Pick<OfficeMemberRow, 'role'> | null
) {
  return membership?.role === 'admin' || isPlatformOfficeAdminRole(user.role)
}

export function getOfficeRoom(event: H3Event, officeId: string) {
  const env = (event.context as CloudflareContext).cloudflare?.env
  const binding = env?.OFFICE_ROOMS as OfficeRoomsBinding | undefined
  if (!binding) {
    throw new Error('OFFICE_ROOMS binding not available')
  }
  const id = binding.idFromName(officeId)
  return binding.get(id)
}

export async function requireOfficeAdmin(event: H3Event, officeId: string) {
  const user = await requireAuth(event)
  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!canAdministerOffice(user, membership)) {
    throw createError({ statusCode: 403, statusMessage: 'Office admin required' })
  }
  return { user, membership }
}
