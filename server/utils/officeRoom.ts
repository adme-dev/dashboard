import type { ActorHandle, ActorRef, ActorType } from '~~/app/types/office'

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
