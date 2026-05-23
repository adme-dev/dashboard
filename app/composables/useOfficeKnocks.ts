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
    | { type: 'knock:request'; targetZoneId: string }
    | { type: 'knock:accept'; knockId: KnockId }
    | { type: 'knock:deny'; knockId: KnockId }
    | { type: 'knock:cancel'; knockId: KnockId }
  ): void
}

export interface PendingKnock {
  targetZoneId: string
  /** Set when knockId comes back via knock:incoming or the first server-side echo. */
  knockId?: KnockId
  status: 'awaiting'
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
  acceptKnock(): void
  denyKnock(): void
  cancelKnock(): void
  onIncoming(msg: Omit<KnockIncomingMessage, 'type'>): void
  onResult(msg: Omit<KnockResultMessage, 'type'>): { status: KnockResultStatus; media?: MediaCredentials }
  onCancelled(msg: Omit<KnockCancelledMessage, 'type'>): void
}

export function useOfficeKnocks(opts: { send: SendFn }): UseOfficeKnocks {
  const pendingKnock = ref<PendingKnock | null>(null)
  const incomingKnock = ref<IncomingKnock | null>(null)

  function sendKnock(targetZoneId: string) {
    if (pendingKnock.value) return  // only one pending knock at a time
    pendingKnock.value = { targetZoneId, status: 'awaiting' }
    opts.send({ type: 'knock:request', targetZoneId })
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
    if (!k?.knockId) {
      pendingKnock.value = null
      return
    }
    opts.send({ type: 'knock:cancel', knockId: k.knockId })
    pendingKnock.value = null
  }

  function onIncoming(msg: Omit<KnockIncomingMessage, 'type'>) {
    incomingKnock.value = { ...msg, receivedAt: Date.now() }
  }

  function onResult(msg: Omit<KnockResultMessage, 'type'>): { status: KnockResultStatus; media?: MediaCredentials } {
    pendingKnock.value = null
    return { status: msg.status, media: msg.media }
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
    acceptKnock,
    denyKnock,
    cancelKnock,
    onIncoming,
    onResult,
    onCancelled,
  }
}
