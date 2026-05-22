import type {
  ActorHandle,
  ActorRef,
  ActorType,
  OfficeMemberRow,
  OfficeZoneRow,
} from '~~/app/types/office'

// =============================================================================
// ActorHandle helpers
// =============================================================================

export function toActorHandle(
  actor: { id: string },
  type: ActorType,
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

export type AclResult =
  | { allowed: true }
  | { allowed: false; reason: string }

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
