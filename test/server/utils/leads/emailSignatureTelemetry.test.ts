import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  rate: vi.fn(),
  record: vi.fn(),
  after: vi.fn()
}))

vi.mock('~~/server/utils/leads/emailIngestion', () => ({
  verifyEmailIngestSignature: mocks.verify
}))
vi.mock('~~/server/utils/tracking/rate-limit', () => ({
  rateCheck: mocks.rate
}))
vi.mock('~~/server/utils/leads/emailHealth', () => ({
  recordEmailTransportEventBatch: mocks.record
}))
vi.mock('~~/server/utils/asyncBackground', () => ({
  runAfterResponse: mocks.after
}))

const { verifyEmailIngestSignatureWithTelemetry } = await import(
  '../../../../server/utils/leads/emailSignatureTelemetry'
)

const authError = Object.assign(new Error('invalid'), { statusCode: 401 })
const request = {
  rawBody: '{}',
  headers: {},
  nowMs: Date.parse('2026-07-29T12:00:00Z')
}

describe('email signature telemetry gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verify.mockRejectedValue(authError)
    mocks.record.mockResolvedValue(1)
  })

  it('uses the shared Durable Object before scheduling Neon telemetry', async () => {
    mocks.rate.mockResolvedValue({ allowed: true })
    const limiter = { idFromName: vi.fn(), get: vi.fn() }
    const event = { context: { cloudflare: { env: { RATE_LIMITER: limiter } } } }

    await expect(verifyEmailIngestSignatureWithTelemetry(event as never, request))
      .rejects.toBe(authError)

    expect(mocks.rate).toHaveBeenCalledWith(limiter, {
      writeKey: 'email-signature-telemetry',
      ipHash: null,
      keyLimit: 1,
      ipLimit: 1,
      windowMs: 60000
    })
    expect(mocks.record).toHaveBeenCalledOnce()
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  it('fails closed without touching Neon when the production gate errors', async () => {
    mocks.rate.mockRejectedValue(new Error('do unavailable'))
    const event = {
      context: {
        cloudflare: {
          env: { RATE_LIMITER: { idFromName: vi.fn(), get: vi.fn() } }
        }
      }
    }
    await expect(verifyEmailIngestSignatureWithTelemetry(event as never, request))
      .rejects.toBe(authError)
    expect(mocks.record).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })
})
