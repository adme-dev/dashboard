/**
 * Pure-function message handlers extracted from OfficeRoom for unit testing.
 * Each handler mutates the supplied participant in-place and returns the
 * outbound messages the caller should send/broadcast.
 */

import type {
  ActorHandle,
  KnockIncomingMessage,
  KnockResultMessage,
  KnockResultStatus,
  MediaCredentials,
  OfficeStatus,
  ZoneType,
} from '../../../app/types/office'
import type { OutboundMessage } from './types'

export interface ParticipantLite {
  handle: ActorHandle
  status: OfficeStatus
  currentZoneId: string | null
  lastSeenAt: number
}

export function applyStatusSet(
  p: ParticipantLite,
  status: OfficeStatus,
  now: number
): { broadcast: OutboundMessage } {
  p.status = status
  p.lastSeenAt = now
  return { broadcast: { type: 'participant:updated', handle: p.handle, status } }
}

export function applyZoneEnter(
  p: ParticipantLite,
  zoneId: string,
  media: MediaCredentials,
  now: number,
): { send: OutboundMessage, broadcast: OutboundMessage } {
  p.currentZoneId = zoneId
  p.lastSeenAt = now
  return {
    send: { type: 'zone:joined', zoneId, media },
    broadcast: { type: 'participant:moved', handle: p.handle, zoneId }
  }
}

export function applyZoneLeave(
  p: ParticipantLite,
  now: number
): { broadcast: OutboundMessage } {
  p.currentZoneId = null
  p.lastSeenAt = now
  return {
    broadcast: { type: 'participant:moved', handle: p.handle, zoneId: null }
  }
}

// =============================================================================
// Phase 1c.1 — Knock state + pure-function handlers
// =============================================================================

export interface KnockStateEntry {
  knockId: string
  knockerHandle: string
  knockerName: string
  knockerWsId: string
  knockeeHandle: string
  knockeeWsId: string
  zoneId: string
  startedAt: number
  expiresAt: number
}

export interface KnockState {
  /** Primary index — knockId → entry */
  byId: Map<string, KnockStateEntry>
  /** Fast busy-check — zoneId → active knockId (only set while accept is in progress) */
  acceptedByZone: Map<string, string>
}

export type KnockHandlerResult<T> =
  | ({ kind: 'ok' } & T)
  | { kind: 'error'; reason: string }

// --- applyKnockRequest -------------------------------------------------------

export interface KnockRequestInput {
  state: KnockState
  knockId: string
  knockerHandle: string
  knockerName: string
  knockerWsId: string
  knockeeHandle: string
  knockeeWsId: string
  zoneId: string
  now: number
  ttlMs: number
}

export function applyKnockRequest(
  input: KnockRequestInput,
): KnockHandlerResult<{ toKnockee: KnockIncomingMessage }> {
  if (input.state.byId.has(input.knockId)) {
    return { kind: 'error', reason: 'duplicate-knock-id' }
  }
  input.state.byId.set(input.knockId, {
    knockId: input.knockId,
    knockerHandle: input.knockerHandle,
    knockerName: input.knockerName,
    knockerWsId: input.knockerWsId,
    knockeeHandle: input.knockeeHandle,
    knockeeWsId: input.knockeeWsId,
    zoneId: input.zoneId,
    startedAt: input.now,
    expiresAt: input.now + input.ttlMs,
  })
  return {
    kind: 'ok',
    toKnockee: {
      type: 'knock:incoming',
      knockId: input.knockId as any,
      fromHandle: input.knockerHandle as any,
      fromName: input.knockerName,
      zoneId: input.zoneId,
      ttlMs: input.ttlMs,
    },
  }
}

// --- applyKnockAccept --------------------------------------------------------

export interface KnockAcceptInput {
  state: KnockState
  knockId: string
}

export interface KnockAcceptOk {
  knockerHandle: string
  knockerName: string
  knockerWsId: string
  knockeeHandle: string
  zoneId: string
}

export function applyKnockAccept(
  input: KnockAcceptInput,
): KnockHandlerResult<KnockAcceptOk> {
  const entry = input.state.byId.get(input.knockId)
  if (!entry) return { kind: 'error', reason: 'not-found' }
  input.state.byId.delete(input.knockId)
  input.state.acceptedByZone.set(entry.zoneId, input.knockId)
  return {
    kind: 'ok',
    knockerHandle: entry.knockerHandle,
    knockerName: entry.knockerName,
    knockerWsId: entry.knockerWsId,
    knockeeHandle: entry.knockeeHandle,
    zoneId: entry.zoneId,
  }
}

// --- applyKnockDeny ----------------------------------------------------------

export interface KnockDenyInput {
  state: KnockState
  knockId: string
}

export function applyKnockDeny(
  input: KnockDenyInput,
): KnockHandlerResult<{ toKnocker: KnockResultMessage; knockerWsId: string }> {
  const entry = input.state.byId.get(input.knockId)
  if (!entry) return { kind: 'error', reason: 'not-found' }
  input.state.byId.delete(input.knockId)
  return {
    kind: 'ok',
    toKnocker: {
      type: 'knock:result',
      knockId: input.knockId as any,
      status: 'denied',
    },
    knockerWsId: entry.knockerWsId,
  }
}

// --- applyKnockCancel --------------------------------------------------------

export interface KnockCancelInput {
  state: KnockState
  knockId: string
  cancellerWsId: string
}

export function applyKnockCancel(
  input: KnockCancelInput,
): KnockHandlerResult<Record<string, never>> {
  const entry = input.state.byId.get(input.knockId)
  if (!entry) return { kind: 'error', reason: 'not-found' }
  if (entry.knockerWsId !== input.cancellerWsId) {
    return { kind: 'error', reason: 'not-canceller' }
  }
  input.state.byId.delete(input.knockId)
  return { kind: 'ok' }
}

// --- applyKnockTimeout -------------------------------------------------------

export interface KnockTimeoutInput {
  state: KnockState
  knockId: string
}

export function applyKnockTimeout(
  input: KnockTimeoutInput,
): KnockHandlerResult<{ toKnocker: KnockResultMessage; knockerWsId: string }> {
  const entry = input.state.byId.get(input.knockId)
  if (!entry) return { kind: 'error', reason: 'not-found' }
  input.state.byId.delete(input.knockId)
  return {
    kind: 'ok',
    toKnocker: {
      type: 'knock:result',
      knockId: input.knockId as any,
      status: 'timeout',
    },
    knockerWsId: entry.knockerWsId,
  }
}

// =============================================================================
// Phase 1c.0 — applyKnockRequestPerson
// =============================================================================

export type KnockPersonResult =
  | {
      kind: 'result'
      result: { type: 'knock:result'; knockId: string; status: KnockResultStatus; targetZoneId?: string }
    }
  | {
      kind: 'adhoc-create'
      knockId: string
      knockerHandle: ActorHandle
      targetHandle: ActorHandle
      anchorZoneId: string
    }
  | {
      kind: 'delegate-zone-knock'
      knockId: string
      knockerHandle: ActorHandle
      targetHandle: ActorHandle
      targetZoneId: string
    }

export function applyKnockRequestPerson(
  state: {
    zoneByOccupant: Map<ActorHandle, { id: string; zone_type: ZoneType }>
  },
  msg: { type: 'knock:request-person'; knockId: string; targetHandle: ActorHandle },
  knockerHandle: ActorHandle,
): KnockPersonResult {
  if (msg.targetHandle === knockerHandle) {
    return { kind: 'result', result: { type: 'knock:result', knockId: msg.knockId, status: 'self-knock' } }
  }

  const targetZone = state.zoneByOccupant.get(msg.targetHandle)
  if (!targetZone) {
    return { kind: 'result', result: { type: 'knock:result', knockId: msg.knockId, status: 'offline' } }
  }

  switch (targetZone.zone_type) {
    case 'lobby':
    case 'meeting':
      return {
        kind: 'result',
        result: { type: 'knock:result', knockId: msg.knockId, status: 'open-room', targetZoneId: targetZone.id },
      }
    case 'desk':
      return {
        kind: 'adhoc-create',
        knockId: msg.knockId,
        knockerHandle,
        targetHandle: msg.targetHandle,
        anchorZoneId: targetZone.id,
      }
    case 'focus':
    case 'adhoc':
    default:
      return {
        kind: 'delegate-zone-knock',
        knockId: msg.knockId,
        knockerHandle,
        targetHandle: msg.targetHandle,
        targetZoneId: targetZone.id,
      }
  }
}
