import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEvent, type EventHandler, type H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readBoundedEmailInternalJson } from '../../../../server/utils/leads/emailInternalBody'

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

  it('reads the Cloudflare Web request stream without using the Node async iterator', async () => {
    const rawBody = JSON.stringify({ recipientToken: '0123456789' })
    const bytes = new TextEncoder().encode(rawBody)
    const nodeRequest = {
      headers: { 'content-type': 'application/json' },
      [Symbol.asyncIterator]() {
        throw new Error('Readable.asyncIterator is not implemented yet!')
      }
    }
    const event = {
      method: 'POST',
      node: { req: nodeRequest },
      web: {
        request: {
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes.subarray(0, 8))
              controller.enqueue(bytes.subarray(8))
              controller.close()
            }
          })
        }
      }
    } as unknown as H3Event

    await expect(readBoundedEmailInternalJson(event, 1_024, 'invalid_email_policy_request'))
      .resolves.toBe(rawBody)
  })

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

  it('passes the request-scoped Workers AI capability to policy resolution', async () => {
    mocks.resolvePolicy.mockResolvedValueOnce({
      schemaVersion: 1,
      parserMode: 'auto',
      aiExtractionMode: 'fallback',
      expectedProvider: null,
      allowedSenderDomains: [],
      maxRawBytes: 2 * 1024 * 1024,
      maxAdfAttachmentBytes: 256 * 1024
    })
    const event = eventFor(JSON.stringify({ recipientToken: '0123456789' }))
    ;(event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare = {
      env: { AI: { run: vi.fn() } }
    }

    await expect(policyHandler(event)).resolves.toMatchObject({
      aiExtractionMode: 'fallback'
    })
    expect(mocks.resolvePolicy).toHaveBeenCalledWith(
      { recipientToken: '0123456789' },
      { aiExtractionAvailable: true }
    )
  })
})
