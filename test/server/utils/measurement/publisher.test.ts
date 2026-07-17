import { describe, expect, it, vi } from 'vitest'
import { createConversionOutboxPublisher } from '../../../../server/utils/measurement/publisher'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const EVENT_ID = '22222222-2222-4222-8222-222222222222'
const CLAIM_ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-07-17T06:00:00.000Z')

function claimedEvent(eventId = EVENT_ID) {
  return { id: eventId, client_id: CLIENT_ID }
}

function setup(options: {
  queue?: { send: ReturnType<typeof vi.fn> } | null
  rows?: Array<{ id: string, client_id: string }>
  executeResult?: number
} = {}) {
  const send = options.queue?.send ?? vi.fn(async () => undefined)
  const queue = options.queue === null ? null : { send }
  const queryRows = vi.fn(async () => options.rows ?? [claimedEvent()])
  const execute = vi.fn(async () => options.executeResult ?? 1)
  const warn = vi.fn()
  const publisher = createConversionOutboxPublisher({
    queryRows,
    execute,
    getQueue: () => queue,
    randomUUID: () => CLAIM_ID,
    now: () => NOW,
    warn
  })
  return { publisher, queryRows, execute, send, warn }
}

describe('conversion outbox publisher', () => {
  it('claims a pending event, publishes only its opaque identity, then confirms publication', async () => {
    const { publisher, queryRows, execute, send } = setup()

    const result = await publisher.publishEvent({} as never, EVENT_ID)

    expect(result).toEqual({ status: 'published', eventId: EVENT_ID })
    expect(queryRows).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE conversion_events[\s\S]*RETURNING e.id, e.client_id/),
      [EVENT_ID, CLAIM_ID, NOW.toISOString()]
    )
    expect(send).toHaveBeenCalledWith({
      schemaVersion: 1,
      clientId: CLIENT_ID,
      eventId: EVENT_ID,
      enqueuedAt: NOW.toISOString()
    }, { contentType: 'json' })
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(/outbox_status = 'published'/),
      [EVENT_ID, CLAIM_ID, NOW.toISOString()]
    )
  })

  it('leaves database state untouched when the production queue binding is unavailable', async () => {
    const { publisher, queryRows, execute } = setup({ queue: null })

    const result = await publisher.publishEvent({} as never, EVENT_ID)

    expect(result).toEqual({ status: 'queue_unavailable', eventId: EVENT_ID })
    expect(queryRows).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns a failed queue send to pending without persisting provider or credential details', async () => {
    const send = vi.fn(async () => {
      throw new TypeError('secret-bearing network detail')
    })
    const { publisher, execute, warn } = setup({ queue: { send } })

    const result = await publisher.publishEvent({} as never, EVENT_ID)

    expect(result).toEqual({ status: 'retryable', eventId: EVENT_ID })
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(/outbox_status = 'pending'[\s\S]*queue_publish_failed/),
      [EVENT_ID, CLAIM_ID, NOW.toISOString()]
    )
    expect(warn).toHaveBeenCalledWith({
      event: 'measurement_outbox_publish_failed',
      eventId: EVENT_ID,
      errorClass: 'TypeError'
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-bearing')
  })

  it('claims a bounded repair batch and independently confirms each queued event', async () => {
    const secondEventId = '44444444-4444-4444-8444-444444444444'
    const { publisher, queryRows, execute, send } = setup({
      rows: [claimedEvent(), claimedEvent(secondEventId)]
    })

    const result = await publisher.repairPending({} as never, 25)

    expect(result).toEqual({ status: 'processed', claimed: 2, published: 2, retryable: 0, unconfirmed: 0 })
    expect(queryRows).toHaveBeenCalledWith(
      expect.stringMatching(/FOR UPDATE SKIP LOCKED[\s\S]*LIMIT \$1/),
      [25, CLAIM_ID, NOW.toISOString()]
    )
    expect(send).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('reports a queued message whose database publication confirmation lost its claim', async () => {
    const { publisher, warn } = setup({ executeResult: 0 })

    const result = await publisher.publishEvent({} as never, EVENT_ID)

    expect(result).toEqual({ status: 'queued_unconfirmed', eventId: EVENT_ID })
    expect(warn).toHaveBeenCalledWith({
      event: 'measurement_outbox_confirmation_failed',
      eventId: EVENT_ID,
      errorClass: 'claim_not_confirmed'
    })
  })
})
