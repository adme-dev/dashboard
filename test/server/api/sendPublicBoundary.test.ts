import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadBody = vi.fn()
const mockSetResponseHeader = vi.fn()
const mockVerifyTurnstile = vi.fn()
const mockCheckCreate = vi.fn()
const mockCheckVerify = vi.fn()
const mockCreateDraft = vi.fn()
const mockVerifySender = vi.fn()
const mockSendVerificationEmail = vi.fn()

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: typeof mockReadBody
  getHeader: (_event: unknown, name: string) => string | undefined
  getRequestIP: () => string | undefined
  setResponseHeader: typeof mockSetResponseHeader
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number }
}
testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = mockReadBody
testGlobal.getHeader = (_event, name) => name === 'cf-connecting-ip' ? '203.0.113.10' : undefined
testGlobal.getRequestIP = () => '203.0.113.10'
testGlobal.setResponseHeader = mockSetResponseHeader
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/send/feature', () => ({
  requirePublicSendEnabled: vi.fn(),
  resolvePublicSendPolicyConfig: () => ({
    surface: 'public',
    maxTransferBytes: 262144000,
    maxFileBytes: 104857600,
    maxFiles: 10,
    defaultRetentionDays: 3,
    maxRetentionDays: 3,
    maxRecipients: 0,
    maxDownloads: 20,
    scanRequired: true
  })
}))

vi.mock('~~/server/utils/turnstile', () => ({
  isTurnstileEnabled: () => true,
  verifyTurnstile: (...args: unknown[]) => mockVerifyTurnstile(...args)
}))

vi.mock('~~/server/utils/tracking/client-ip', () => ({
  resolveClientIp: (cfIp?: string, fallback?: string) => cfIp || fallback || null
}))

vi.mock('~~/server/utils/send/publicRateLimit', () => ({
  PublicSendRateLimitError: class PublicSendRateLimitError extends Error {},
  createPublicSendRateLimiter: () => ({
    checkCreate: (...args: unknown[]) => mockCheckCreate(...args),
    checkVerify: (...args: unknown[]) => mockCheckVerify(...args)
  })
}))

vi.mock('~~/server/utils/send/publicSender', () => ({
  PublicSendError: class PublicSendError extends Error {},
  createPublicSendService: () => ({
    createDraft: (...args: unknown[]) => mockCreateDraft(...args),
    verifySender: (...args: unknown[]) => mockVerifySender(...args)
  })
}))

vi.mock('~~/server/utils/send/publicEmail', () => ({
  sendPublicSendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args)
}))

const event = {
  context: {
    cloudflare: {
      env: {
        RATE_LIMITER: { binding: true },
        SEND_PUBLIC_RATE_SALT: 's'.repeat(32),
        SEND_PUBLIC_TURNSTILE_HOSTNAME: 'app.xeroflow.io'
      }
    }
  }
}

describe('public Send API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyTurnstile.mockResolvedValue(true)
    mockCheckCreate.mockResolvedValue({ allowed: true })
    mockCheckVerify.mockResolvedValue({ allowed: true })
    mockCreateDraft.mockResolvedValue({
      transferId: '44444444-4444-4444-8444-444444444444',
      status: 'awaiting_verification',
      verificationExpiresAt: '2026-07-21T00:15:00.000Z'
    })
    mockVerifySender.mockResolvedValue({
      transferId: '44444444-4444-4444-8444-444444444444',
      publicSenderId: '55555555-5555-4555-8555-555555555555',
      status: 'uploading',
      managementToken: 'm'.repeat(43)
    })
  })

  it('checks Turnstile and layered limits before creating an enumeration-safe draft', async () => {
    mockReadBody.mockResolvedValue({
      email: 'Sender@Example.com',
      title: 'Launch assets',
      expiresAt: '2026-07-24T00:00:00.000Z',
      maxDownloads: 10,
      idempotencyKey: 'public-draft-000001',
      turnstileToken: 'turnstile-response'
    })
    const handler = (await import('~~/server/api/public/send/drafts.post')).default

    await expect(handler(event as never)).resolves.toEqual({
      ok: true,
      status: 'verification_pending'
    })

    expect(mockVerifyTurnstile).toHaveBeenCalledWith(
      'turnstile-response',
      '203.0.113.10',
      { expectedAction: 'send-create', expectedHostname: 'app.xeroflow.io' }
    )
    expect(mockCheckCreate).toHaveBeenCalledWith(expect.objectContaining({
      salt: 's'.repeat(32),
      ip: '203.0.113.10',
      email: 'sender@example.com'
    }))
    expect(mockCreateDraft).toHaveBeenCalledWith(expect.objectContaining({
      email: 'sender@example.com',
      draft: expect.objectContaining({ recipients: [] })
    }))
    expect(mockVerifyTurnstile.mock.invocationCallOrder[0])
      .toBeLessThan(mockCreateDraft.mock.invocationCallOrder[0]!)
  })

  it('fails closed before persistence when Turnstile rejects', async () => {
    mockVerifyTurnstile.mockResolvedValue(false)
    mockReadBody.mockResolvedValue({
      email: 'sender@example.com',
      title: 'Launch assets',
      expiresAt: '2026-07-24T00:00:00.000Z',
      idempotencyKey: 'public-draft-000001',
      turnstileToken: 'bad-token'
    })
    const handler = (await import('~~/server/api/public/send/drafts.post')).default

    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockCheckCreate).not.toHaveBeenCalled()
    expect(mockCreateDraft).not.toHaveBeenCalled()
  })

  it('verifies all capabilities only after Turnstile and the verification budget pass', async () => {
    mockReadBody.mockResolvedValue({
      transferId: '44444444-4444-4444-8444-444444444444',
      verificationToken: 'v'.repeat(43),
      managementToken: 'm'.repeat(43),
      turnstileToken: 'turnstile-response'
    })
    const handler = (await import('~~/server/api/public/send/verifications.post')).default

    await expect(handler(event as never)).resolves.toEqual({
      ok: true,
      transferId: '44444444-4444-4444-8444-444444444444',
      status: 'uploading'
    })
    expect(mockCheckVerify).toHaveBeenCalledWith(expect.objectContaining({ ip: '203.0.113.10' }))
    expect(mockVerifySender).toHaveBeenCalledWith(expect.objectContaining({
      verificationToken: 'v'.repeat(43),
      managementToken: 'm'.repeat(43)
    }))
  })
})
