import { beforeEach, describe, expect, it, vi } from 'vitest'

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readRawBody: (event: { rawBody?: string }) => Promise<string | undefined>
  getRequestHeaders: () => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error
}
globals.defineEventHandler = handler => handler
globals.readRawBody = async event => event.rawBody
globals.getRequestHeaders = () => ({})
globals.createError = input => Object.assign(new Error(input.statusMessage), input)

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

describe('signed email transport telemetry boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.record.mockResolvedValue(1)
  })

  it('returns 400 for authenticated malformed JSON without persisting', async () => {
    await expect(handler({ rawBody: '{malformed', context: {} } as never))
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
    await expect(handler({ rawBody, context: {} } as never))
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
    await expect(handler({ rawBody, context: {} } as never)).resolves.toEqual({
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
  })
})
