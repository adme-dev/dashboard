import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEvent } from 'h3'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  record: vi.fn()
}))

vi.mock('~~/server/utils/leads/emailSignatureTelemetry', () => ({
  verifyEmailIngestSignatureWithTelemetry: mocks.verify
}))
vi.mock('~~/server/utils/leads/emailHealth', () => ({
  recordEmailTransportEventBatch: mocks.record
}))

const { default: handler } = await import(
  '../../../../server/api/internal/leads/email-telemetry.post'
)

function eventFor(rawBody: string, chunks = 1) {
  const bytes = Buffer.from(rawBody)
  const chunkSize = Math.max(1, Math.ceil(bytes.byteLength / chunks))
  const request = Readable.from(
    Array.from(
      { length: Math.ceil(bytes.byteLength / chunkSize) },
      (_, index) => bytes.subarray(index * chunkSize, (index + 1) * chunkSize)
    )
  ) as unknown as IncomingMessage
  request.method = 'POST'
  request.url = '/api/internal/leads/email-telemetry'
  request.headers = { 'content-type': 'application/json' }
  const response = {
    writableEnded: false,
    headersSent: false
  } as ServerResponse
  return createEvent(request, response)
}

describe('signed email transport telemetry boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.record.mockResolvedValue(1)
  })

  it('returns 400 for authenticated malformed JSON without persisting', async () => {
    await expect(handler(eventFor('{malformed')))
      .rejects.toMatchObject({
        statusCode: 400,
        statusMessage: 'invalid_email_telemetry_batch'
      })
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('rejects Worker-supplied endpoint/client scope', async () => {
    const rawBody = JSON.stringify({
      schemaVersion: 1,
      batchId: '10000000-0000-4000-8000-000000000001',
      events: [{
        eventClass: 'r2_delete_failure',
        correlationId: '10000000-0000-4000-8000-000000000002',
        endpointId: '10000000-0000-4000-8000-000000000003',
        clientId: '10000000-0000-4000-8000-000000000004'
      }]
    })
    await expect(handler(eventFor(rawBody)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('persists only content-free class and correlation for server-side scope resolution', async () => {
    const rawBody = JSON.stringify({
      schemaVersion: 1,
      batchId: '10000000-0000-4000-8000-000000000001',
      events: [{
        eventClass: 'r2_delete_failure',
        correlationId: '10000000-0000-4000-8000-000000000002'
      }]
    })
    await expect(handler(eventFor(rawBody, 3))).resolves.toEqual({
      schemaVersion: 1,
      status: 'recorded',
      inserted: 1
    })
    expect(mocks.record).toHaveBeenCalledWith({
      batchId: '10000000-0000-4000-8000-000000000001',
      events: [{
        eventClass: 'r2_delete_failure',
        correlationId: '10000000-0000-4000-8000-000000000002'
      }]
    })
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rawBody })
    )
  })
})
