import { describe, expect, it, vi } from 'vitest'
import { createSendScanQueueHandler } from '../../workers/send-scanner/src/queue'

const JOB_ID = '77777777-7777-4777-8777-777777777777'
const FILE_ID = '55555555-5555-4555-8555-555555555555'
const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'

function queueMessage(body: unknown) {
  return {
    id: 'queue-message-1',
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn()
  }
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    expectedAccountId: 'cloudflare-account',
    expectedBucket: 'agency-files',
    findJobForObject: vi.fn(async () => JOB_ID),
    processJob: vi.fn(async () => ({ action: 'ack' as const, outcome: 'clean' as const })),
    log: vi.fn(),
    now: vi.fn(() => new Date('2026-07-21T01:00:00.000Z')),
    ...overrides
  }
}

function r2Event(overrides: Record<string, unknown> = {}) {
  return {
    account: 'cloudflare-account',
    action: 'CompleteMultipartUpload',
    bucket: 'agency-files',
    object: {
      key: `send/${TRANSFER_ID}/${FILE_ID}`,
      size: 2048,
      eTag: 'event-etag'
    },
    eventTime: '2026-07-21T00:59:00.000Z',
    ...overrides
  }
}

describe('Send scanner Queue boundary', () => {
  it('resolves an R2 wake-up through canonical storage and acknowledges clean work', async () => {
    const dependencies = deps()
    const handler = createSendScanQueueHandler(dependencies)
    const message = queueMessage(r2Event())

    await handler(message)

    expect(dependencies.findJobForObject).toHaveBeenCalledWith(`send/${TRANSFER_ID}/${FILE_ID}`)
    expect(dependencies.processJob).toHaveBeenCalledWith({
      jobId: JOB_ID,
      now: new Date('2026-07-21T01:00:00.000Z')
    })
    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
  })

  it('accepts only an identifier-only internal replay message', async () => {
    const dependencies = deps()
    const handler = createSendScanQueueHandler(dependencies)
    const message = queueMessage({ schemaVersion: 1, jobId: JOB_ID })

    await handler(message)

    expect(dependencies.findJobForObject).not.toHaveBeenCalled()
    expect(dependencies.processJob).toHaveBeenCalledWith({ jobId: JOB_ID, now: expect.any(Date) })
    expect(message.ack).toHaveBeenCalledOnce()
  })

  it.each([
    ['wrong account', r2Event({ account: 'attacker-account' })],
    ['wrong bucket', r2Event({ bucket: 'other-bucket' })],
    ['non-Send key', r2Event({ object: { key: 'other/prefix', size: 2048, eTag: 'etag' } })],
    ['unknown shape', { jobId: JOB_ID, objectKey: `send/${TRANSFER_ID}/${FILE_ID}` }]
  ])('acknowledges poison input without database or scanner work: %s', async (_label, body) => {
    const dependencies = deps()
    const handler = createSendScanQueueHandler(dependencies)
    const message = queueMessage(body)

    await handler(message)

    expect(dependencies.findJobForObject).not.toHaveBeenCalled()
    expect(dependencies.processJob).not.toHaveBeenCalled()
    expect(message.ack).toHaveBeenCalledOnce()
    expect(dependencies.log).toHaveBeenCalledWith(expect.objectContaining({
      event: 'send_scan_message_ignored',
      messageId: message.id
    }))
  })

  it('retries when the R2 event arrives before the completion transaction', async () => {
    const dependencies = deps({ findJobForObject: vi.fn(async () => null) })
    const handler = createSendScanQueueHandler(dependencies)
    const message = queueMessage(r2Event())

    await handler(message)

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 })
    expect(message.ack).not.toHaveBeenCalled()
  })

  it('uses the bounded orchestration retry and never logs message bodies', async () => {
    const dependencies = deps({
      processJob: vi.fn(async () => ({
        action: 'retry' as const,
        delaySeconds: 120,
        outcome: 'not_ready' as const
      }))
    })
    const handler = createSendScanQueueHandler(dependencies)
    const message = queueMessage(r2Event())

    await handler(message)

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 120 })
    expect(JSON.stringify(dependencies.log.mock.calls)).not.toContain(`send/${TRANSFER_ID}/${FILE_ID}`)
    expect(JSON.stringify(dependencies.log.mock.calls)).not.toContain('event-etag')
  })

  it('retries unexpected failures with a stable redacted reason', async () => {
    const dependencies = deps({
      processJob: vi.fn(async () => {
        throw new Error(`scanner failed for send/${TRANSFER_ID}/${FILE_ID}`)
      })
    })
    const handler = createSendScanQueueHandler(dependencies)
    const message = queueMessage({ schemaVersion: 1, jobId: JOB_ID })

    await handler(message)

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 })
    expect(dependencies.log).toHaveBeenCalledWith(expect.objectContaining({
      event: 'send_scan_message_failed',
      reasonCode: 'UNEXPECTED_FAILURE'
    }))
    expect(JSON.stringify(dependencies.log.mock.calls)).not.toContain(`send/${TRANSFER_ID}/${FILE_ID}`)
  })
})
