export const CRM_EMAIL_DELIVERY_STATES = [
  'draft',
  'queued',
  'sending',
  'sent',
  'delivered',
  'deferred',
  'bounced',
  'failed',
  'rejected',
  'complained',
  'cancelled',
] as const

export type CrmEmailDeliveryState = typeof CRM_EMAIL_DELIVERY_STATES[number]
export type CrmEmailDirection = 'inbound' | 'outbound'

export interface CrmEmailParticipant {
  address: string
  name?: string | null
}

export interface CrmEmailEnvelope {
  direction: CrmEmailDirection
  from: CrmEmailParticipant
  to: CrmEmailParticipant[]
  cc: CrmEmailParticipant[]
  bcc: CrmEmailParticipant[]
  subject: string | null
  text: string | null
  html: string | null
  internetMessageId: string | null
  inReplyTo: string | null
  references: string[]
  occurredAt: string
}

export interface CrmEmailDeliveryProjection {
  state: CrmEmailDeliveryState
  changed: boolean
}

const TERMINAL_DELIVERY_STATES: ReadonlySet<CrmEmailDeliveryState> = new Set([
  'bounced',
  'failed',
  'rejected',
  'complained',
  'cancelled',
])

const DELIVERY_STATE_RANK: Record<CrmEmailDeliveryState, number> = {
  draft: 0,
  queued: 1,
  sending: 2,
  sent: 3,
  deferred: 4,
  delivered: 5,
  bounced: 6,
  failed: 6,
  rejected: 6,
  complained: 6,
  cancelled: 6,
}

/**
 * Projects an unordered provider event onto the canonical message state.
 * Terminal outcomes never regress, while a terminal event always closes a
 * non-terminal state.
 */
export function projectEmailDeliveryState(
  current: CrmEmailDeliveryState,
  incoming: CrmEmailDeliveryState,
): CrmEmailDeliveryProjection {
  if (current === incoming || TERMINAL_DELIVERY_STATES.has(current)) {
    return { state: current, changed: false }
  }

  if (current === 'delivered') {
    return incoming === 'complained'
      ? { state: incoming, changed: true }
      : { state: current, changed: false }
  }

  if (
    TERMINAL_DELIVERY_STATES.has(incoming)
    || DELIVERY_STATE_RANK[incoming] > DELIVERY_STATE_RANK[current]
  ) {
    return { state: incoming, changed: true }
  }

  return { state: current, changed: false }
}
