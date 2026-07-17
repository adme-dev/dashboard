import type { H3Event } from 'h3'
import { execute as defaultExecute, queryRows as defaultQueryRows } from '~~/server/utils/db'
import { ConversionDeliveryQueueMessageSchema } from '~~/server/utils/measurement/contracts'

interface QueueProducer {
  send(message: unknown, options?: { contentType?: 'json' }): Promise<void>
}

interface ClaimedEventRow {
  id: string
  client_id: string
}

interface PublisherDeps {
  queryRows: (sql: string, params?: unknown[]) => Promise<ClaimedEventRow[]>
  execute: (sql: string, params?: unknown[]) => Promise<number>
  getQueue: (event: H3Event) => QueueProducer | null
  randomUUID: () => string
  now: () => Date
  warn: (entry: Record<string, unknown>) => void
}

export type PublishConversionEventResult
  = { status: 'published' | 'retryable' | 'queued_unconfirmed' | 'not_claimed' | 'queue_unavailable', eventId: string }

export interface RepairConversionOutboxResult {
  status: 'processed' | 'queue_unavailable'
  claimed: number
  published: number
  retryable: number
  unconfirmed: number
}

function getQueueFromEvent(event: H3Event): QueueProducer | null {
  try {
    const context = event.context as {
      cloudflare?: { env?: { MEASUREMENT_DELIVERY_QUEUE?: QueueProducer } }
    }
    return context.cloudflare?.env?.MEASUREMENT_DELIVERY_QUEUE ?? null
  } catch {
    return null
  }
}

const defaultDeps: PublisherDeps = {
  queryRows: defaultQueryRows as PublisherDeps['queryRows'],
  execute: defaultExecute as PublisherDeps['execute'],
  getQueue: getQueueFromEvent,
  randomUUID: () => crypto.randomUUID(),
  now: () => new Date(),
  warn: entry => console.warn(entry)
}

const CLAIM_ONE_SQL = `
  UPDATE conversion_events e
     SET outbox_status = 'claimed',
         claimed_at = $3::timestamptz,
         claimed_by = $2,
         last_error_class = NULL
   WHERE e.id = $1
     AND (
       (e.outbox_status = 'pending' AND e.available_at <= $3::timestamptz)
       OR (
         e.outbox_status = 'claimed'
         AND e.claimed_at < $3::timestamptz - INTERVAL '5 minutes'
       )
     )
  RETURNING e.id, e.client_id
`

const CLAIM_BATCH_SQL = `
  WITH candidates AS (
    SELECT id
      FROM conversion_events
     WHERE (
       (outbox_status = 'pending' AND available_at <= $3::timestamptz)
       OR (
         outbox_status = 'claimed'
         AND claimed_at < $3::timestamptz - INTERVAL '5 minutes'
       )
     )
     ORDER BY available_at, created_at
     FOR UPDATE SKIP LOCKED
     LIMIT $1
  )
  UPDATE conversion_events e
     SET outbox_status = 'claimed',
         claimed_at = $3::timestamptz,
         claimed_by = $2,
         last_error_class = NULL
    FROM candidates
   WHERE e.id = candidates.id
  RETURNING e.id, e.client_id
`

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 255) : 'unknown'
}

export function createConversionOutboxPublisher(deps: PublisherDeps = defaultDeps) {
  async function publishClaimed(
    queue: QueueProducer,
    row: ClaimedEventRow,
    claimId: string,
    observedAt: string
  ): Promise<PublishConversionEventResult> {
    const message = ConversionDeliveryQueueMessageSchema.parse({
      schemaVersion: 1,
      clientId: row.client_id,
      eventId: row.id,
      enqueuedAt: observedAt
    })

    try {
      await queue.send(message, { contentType: 'json' })
    } catch (error) {
      await deps.execute(
        `UPDATE conversion_events
            SET outbox_status = 'pending',
                available_at = $3::timestamptz + INTERVAL '1 minute',
                claimed_at = NULL,
                claimed_by = NULL,
                last_error_class = 'queue_publish_failed'
          WHERE id = $1
            AND outbox_status = 'claimed'
            AND claimed_by = $2`,
        [row.id, claimId, observedAt]
      )
      deps.warn({
        event: 'measurement_outbox_publish_failed',
        eventId: row.id,
        errorClass: errorClass(error)
      })
      return { status: 'retryable', eventId: row.id }
    }

    let confirmationErrorClass = 'claim_not_confirmed'
    try {
      const confirmed = await deps.execute(
        `UPDATE conversion_events
            SET outbox_status = 'published',
                published_at = $3::timestamptz,
                claimed_at = NULL,
                claimed_by = NULL,
                last_error_class = NULL
          WHERE id = $1
            AND outbox_status = 'claimed'
            AND claimed_by = $2`,
        [row.id, claimId, observedAt]
      )
      if (confirmed === 1) return { status: 'published', eventId: row.id }
    } catch (error) {
      confirmationErrorClass = errorClass(error)
    }

    deps.warn({
      event: 'measurement_outbox_confirmation_failed',
      eventId: row.id,
      errorClass: confirmationErrorClass
    })

    return { status: 'queued_unconfirmed', eventId: row.id }
  }

  return {
    async publishEvent(event: H3Event, eventId: string): Promise<PublishConversionEventResult> {
      const queue = deps.getQueue(event)
      if (!queue) return { status: 'queue_unavailable', eventId }

      const claimId = deps.randomUUID()
      const observedAt = deps.now().toISOString()
      const rows = await deps.queryRows(CLAIM_ONE_SQL, [eventId, claimId, observedAt])
      const row = rows[0]
      if (!row) return { status: 'not_claimed', eventId }
      return publishClaimed(queue, row, claimId, observedAt)
    },

    async repairPending(event: H3Event, limit = 100): Promise<RepairConversionOutboxResult> {
      const queue = deps.getQueue(event)
      if (!queue) {
        return { status: 'queue_unavailable', claimed: 0, published: 0, retryable: 0, unconfirmed: 0 }
      }

      const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)))
      const claimId = deps.randomUUID()
      const observedAt = deps.now().toISOString()
      const rows = await deps.queryRows(CLAIM_BATCH_SQL, [boundedLimit, claimId, observedAt])
      let published = 0
      let retryable = 0
      let unconfirmed = 0

      for (const row of rows) {
        const result = await publishClaimed(queue, row, claimId, observedAt)
        if (result.status === 'published') published += 1
        else if (result.status === 'retryable') retryable += 1
        else unconfirmed += 1
      }

      return {
        status: 'processed',
        claimed: rows.length,
        published,
        retryable,
        unconfirmed
      }
    }
  }
}

export const conversionOutboxPublisher = createConversionOutboxPublisher()
