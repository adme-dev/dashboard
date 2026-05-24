// Client-side knock state composable for Phase 1c.1.
// Owns:
//   - pendingKnock: the one outbound knock the user has sent, awaiting response
//   - incomingKnock: the one inbound knock the user has received
// Sends WS messages via the injected `send` callback (decouples from any
// specific WebSocket implementation; the office-room WS composable wires this).

import { ref, type Ref } from 'vue'
import type {
  ActorHandle,
  KnockId,
  KnockIncomingMessage,
  KnockResultMessage,
  KnockCancelledMessage,
  KnockResultStatus,
  MediaCredentials,
} from '~~/app/types/office'

interface SendFn {
  (msg:
    | { type: 'knock:request'; knockId: KnockId; targetZoneId: string }
    | { type: 'knock:request-person'; knockId: KnockId; targetHandle: ActorHandle }
    | { type: 'knock:accept'; knockId: KnockId }
    | { type: 'knock:deny'; knockId: KnockId }
    | { type: 'knock:cancel'; knockId: KnockId }
  ): void
}

export interface PendingKnock {
  targetZoneId?: string
  targetHandle?: ActorHandle
  /** Client-generated UUID, minted synchronously in sendKnock before the WS message is sent. */
  knockId: KnockId
  status: 'awaiting'
  kind: 'zone' | 'person'
}

export interface IncomingKnock {
  knockId: KnockId
  fromHandle: ActorHandle
  fromName: string
  zoneId: string
  ttlMs: number
  receivedAt: number
}

export interface UseOfficeKnocks {
  pendingKnock: Ref<PendingKnock | null>
  incomingKnock: Ref<IncomingKnock | null>
  sendKnock(targetZoneId: string): void
  sendPersonKnock(targetHandle: ActorHandle): void
  acceptKnock(): void
  denyKnock(): void
  cancelKnock(): void
  onIncoming(msg: Omit<KnockIncomingMessage, 'type'>): void
  /**
   * Returns the result status, media credentials (only when accepted), and
   * the targetZoneId of the cleared pendingKnock so the parent can update
   * its local `currentZoneId` on accepted results (the server broadcasts a
   * `participant:moved` for the knocker but no `zone:joined`, so the parent
   * must wire `currentZoneId`/`currentMediaCredentials` itself).
   */
  onResult(msg: Omit<KnockResultMessage, 'type'>): { status: KnockResultStatus; media?: MediaCredentials; targetZoneId?: string }
  onCancelled(msg: Omit<KnockCancelledMessage, 'type'>): void
}

export function useOfficeKnocks(opts: { send: SendFn }): UseOfficeKnocks {
  const pendingKnock = ref<PendingKnock | null>(null)
  const incomingKnock = ref<IncomingKnock | null>(null)

  function sendKnock(targetZoneId: string) {
    if (pendingKnock.value) return  // only one pending knock at a time
    const knockId = crypto.randomUUID() as KnockId
    pendingKnock.value = { targetZoneId, knockId, status: 'awaiting', kind: 'zone' }
    opts.send({ type: 'knock:request', knockId, targetZoneId })
  }

  function sendPersonKnock(targetHandle: ActorHandle) {
    if (pendingKnock.value) return  // only one pending knock at a time
    const knockId = crypto.randomUUID() as KnockId
    pendingKnock.value = { targetHandle, knockId, status: 'awaiting', kind: 'person' }
    opts.send({ type: 'knock:request-person', knockId, targetHandle })
  }

  function acceptKnock() {
    const k = incomingKnock.value
    if (!k) return
    opts.send({ type: 'knock:accept', knockId: k.knockId })
    incomingKnock.value = null
  }

  function denyKnock() {
    const k = incomingKnock.value
    if (!k) return
    opts.send({ type: 'knock:deny', knockId: k.knockId })
    incomingKnock.value = null
  }

  function cancelKnock() {
    const k = pendingKnock.value
    if (!k) return
    opts.send({ type: 'knock:cancel', knockId: k.knockId })
    pendingKnock.value = null
  }

  function onIncoming(msg: Omit<KnockIncomingMessage, 'type'>) {
    incomingKnock.value = { ...msg, receivedAt: Date.now() }
  }

  function onResult(msg: Omit<KnockResultMessage, 'type'>): { status: KnockResultStatus; media?: MediaCredentials; targetZoneId?: string } {
    // For zone knocks: targetZoneId lives in pendingKnock.
    // For open-room results (including person knocks): targetZoneId is in the message.
    const pendingTargetZoneId = pendingKnock.value?.targetZoneId
    pendingKnock.value = null
    return { status: msg.status, media: msg.media, targetZoneId: msg.targetZoneId ?? pendingTargetZoneId }
  }

  function onCancelled(msg: Omit<KnockCancelledMessage, 'type'>) {
    // Server signals the knocker has abandoned the knock (left zone, tab closed,
    // or disconnected). Silently close the incoming modal if it matches.
    if (incomingKnock.value && incomingKnock.value.knockId === msg.knockId) {
      incomingKnock.value = null
    }
  }

  return {
    pendingKnock,
    incomingKnock,
    sendKnock,
    sendPersonKnock,
    acceptKnock,
    denyKnock,
    cancelKnock,
    onIncoming,
    onResult,
    onCancelled,
  }
}
