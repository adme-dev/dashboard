import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEvent, type EventHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(async () => {}),
  accept: vi.fn(),
  resolvePolicy: vi.fn(),
  reserveStage: vi.fn(),
  markReceipt: vi.fn(),
  confirmStage: vi.fn(),
  recordTransport: vi.fn()
}))

vi.mock('~~/server/utils/leads/emailSignatureTelemetry', () => ({
  verifyEmailIngestSignatureWithTelemetry: mocks.verify
}))
vi.mock('~~/server/utils/leads/emailIngestion', () => ({
  acceptEmailEnvelope: mocks.accept,
  resolveEmailEndpointPolicy: mocks.resolvePolicy,
  reserveEmailIngestionStage: mocks.reserveStage,
  markEmailEndpointReceipt: mocks.markReceipt,
  confirmEmailIngestionStage: mocks.confirmStage
}))
vi.mock('~~/server/utils/leads/emailHealth', () => ({
  recordEmailTransportEventBatch: mocks.recordTransport
}))
vi.mock('~~/shared/leads/email/telemetry', () => ({
  emitEmailIngestionEvent: vi.fn()
}))

const [
  { default: ingestHandler },
  { default: policyHandler },
  { default: stageHandler },
  { default: confirmationHandler },
  { default: telemetryHandler }
] = await Promise.all([
  import('../../../../server/api/internal/leads/email-ingest.post'),
  import('../../../../server/api/internal/leads/email-policy.post'),
  import('../../../../server/api/internal/leads/email-stage.post'),
  import('../../../../server/api/internal/leads/email-stage-confirm.post'),
  import('../../../../server/api/internal/leads/email-telemetry.post')
])

function eventFor(rawBody: string, contentLength?: number) {
  const bytes = Buffer.from(rawBody)
  const midpoint = Math.max(1, Math.floor(bytes.byteLength / 2))
  const request = Readable.from([
    bytes.subarray(0, midpoint),
    bytes.subarray(midpoint)
  ]) as unknown as IncomingMessage
  request.method = 'POST'
  request.url = '/api/internal/leads/test'
  request.headers = {
    'content-type': 'application/json',
    ...(contentLength === undefined ? {} : { 'content-length': String(contentLength) })
  }
  const response = {
    writableEnded: false,
    headersSent: false
  } as ServerResponse
  return createEvent(request, response)
}

function jsonLargerThan(bytes: number): string {
  return JSON.stringify({ padding: 'x'.repeat(bytes) })
}

describe('signed email internal route body limits', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['policy', policyHandler, 1_024],
    ['stage confirmation', confirmationHandler, 2_048],
    ['telemetry', telemetryHandler, 16 * 1_024],
    ['stage reservation', stageHandler, 64 * 1_024],
    ['canonical ingest', ingestHandler, 2 * 1024 * 1_024]
  ] as Array<[string, EventHandler, number]>)(
    'rejects a chunked oversized %s body before signature verification',
    async (_label, handler, limit) => {
      await expect(handler(eventFor(jsonLargerThan(limit))))
        .rejects.toMatchObject({ statusCode: 413 })

      expect(mocks.verify).not.toHaveBeenCalled()
    }
  )

  it('uses Content-Length only as an early rejection hint', async () => {
    await expect(policyHandler(eventFor('{}', 1_025)))
      .rejects.toMatchObject({ statusCode: 413 })

    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it('still enforces observed bytes when Content-Length understates the body', async () => {
    await expect(policyHandler(eventFor(jsonLargerThan(1_024), 2)))
      .rejects.toMatchObject({ statusCode: 413 })

    expect(mocks.verify).not.toHaveBeenCalled()
  })
})
