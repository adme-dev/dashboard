import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  body?: unknown
  status?: number
  context: {
    cloudflare?: {
      env?: Record<string, unknown>
    }
  }
}

const SECRET = 'worker-shared-secret'
const REPLY_SECRET = 'reply-secret-that-is-at-least-thirty-two-bytes'
const ROUTE_TOKEN = `v1.${'A'.repeat(32)}.${'B'.repeat(43)}`
const ROUTE_HASH = 'c'.repeat(64)
const ROUTE_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const R2_MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const R2_PREFIX
  = `crm-email/inbound/2026/07/30/${R2_MESSAGE_ID}`

const mockReadBody = vi.fn(async (event: TestEvent) => event.body)
const mockResolveRoute = vi.fn()
const mockEnqueue = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getHeader: (event: TestEvent, name: string) =>
    event.headers?.[name.toLowerCase()] ?? event.headers?.[name],
  readBody: (event: TestEvent) => mockReadBody(event),
  setResponseStatus: (event: TestEvent, status: number) => {
    event.status = status
  },
  createError: (input: { statusCode: number, statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input)
}))

vi.mock('~~/server/utils/crm/emailRouteRepository', () => ({
  resolveCrmInboundEmailRoute: (...args: unknown[]) => mockResolveRoute(...args)
}))

vi.mock('~~/server/utils/crm/emailInboundQueue', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/crm/emailInboundQueue')>(),
  enqueueCrmInboundEmail: (...args: unknown[]) => mockEnqueue(...args)
}))

const oldEnv = { ...process.env }
const { default: handler } = await import(
  '../../../server/api/internal/crm-email/inbound.post'
)
const inboundEndpoint = handler as (event: TestEvent) => Promise<{
  accepted: true
}>

function validBody() {
  return {
    routeKind: 'conversation_reply',
    routeToken: ROUTE_TOKEN,
    recipientDomain: 'reply.xeroflow.io',
    providerMessageId: '<provider-message@example.net>',
    rawMimeR2Key: `${R2_PREFIX}/message.eml`,
    rawMimeSha256: 'd'.repeat(64),
    rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
    attachments: [{
      r2ObjectKey: `${R2_PREFIX}/attachments/01.bin`,
      filename: 'Customer Contract.pdf',
      contentType: 'application/pdf',
      byteSize: 1024,
      sha256: 'e'.repeat(64),
      contentId: '<contract@example.net>'
    }],
    receivedAt: '2026-07-30T05:30:00.000Z'
  }
}

function event(
  body: unknown = validBody(),
  overrides: Record<string, unknown> = {}
): TestEvent {
  return {
    headers: { 'x-crm-email-secret': SECRET },
    body,
    context: {
      cloudflare: {
        env: {
          CRM_EMAIL_WORKER_SECRET: SECRET,
          CRM_EMAIL_CONVERSATIONS_ENABLED: 'true',
          CRM_EMAIL_REPLY_SECRETS: JSON.stringify({ 1: REPLY_SECRET }),
          CRM_EMAIL_INBOUND_QUEUE: { send: vi.fn() },
          ...overrides
        }
      }
    }
  }
}

describe('CRM email inbound internal endpoint', () => {
  beforeEach(() => {
    process.env = { ...oldEnv }
    delete process.env.CRM_EMAIL_WORKER_SECRET
    delete process.env.CRM_EMAIL_CONVERSATIONS_ENABLED
    delete process.env.CRM_EMAIL_REPLY_SECRETS
    vi.clearAllMocks()
    mockResolveRoute.mockResolvedValue({
      id: ROUTE_ID,
      clientId: CLIENT_ID,
      conversationId: CONVERSATION_ID,
      routeKind: 'conversation_reply',
      tokenVersion: 1,
      recipientDomain: 'reply.xeroflow.io',
      routeTokenHash: ROUTE_HASH
    })
    mockEnqueue.mockResolvedValue(undefined)
  })

  it('fails closed before reading the body when the Worker secret is missing', async () => {
    const request = event(validBody(), {
      CRM_EMAIL_WORKER_SECRET: undefined
    })

    await expect(inboundEndpoint(request)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'CRM email Worker authentication is not configured'
    })
    expect(mockReadBody).not.toHaveBeenCalled()
    expect(mockResolveRoute).not.toHaveBeenCalled()
  })

  it('rejects the wrong Worker secret before reading the body', async () => {
    const request = event()
    request.headers = { 'x-crm-email-secret': 'wrong-secret' }

    await expect(inboundEndpoint(request)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
    expect(mockReadBody).not.toHaveBeenCalled()
    expect(mockResolveRoute).not.toHaveBeenCalled()
  })

  it('stays inert while CRM email conversations are disabled', async () => {
    const request = event(validBody(), {
      CRM_EMAIL_CONVERSATIONS_ENABLED: 'false'
    })

    await expect(inboundEndpoint(request)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'CRM email conversations are disabled'
    })
    expect(mockReadBody).not.toHaveBeenCalled()
  })

  it('fails closed when the versioned HMAC keyring is missing', async () => {
    const request = event(validBody(), {
      CRM_EMAIL_REPLY_SECRETS: undefined
    })

    await expect(inboundEndpoint(request)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'CRM email reply secrets are not configured'
    })
    expect(mockReadBody).not.toHaveBeenCalled()
  })

  it('rejects malformed payloads without resolving or enqueuing', async () => {
    const request = event({
      ...validBody(),
      rawMimeR2Key: '../other-tenant/message.eml'
    })

    await expect(inboundEndpoint(request)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid CRM email inbound payload'
    })
    expect(mockResolveRoute).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a foreign attachment prefix',
      {
        attachments: [{
          ...validBody().attachments[0],
          r2ObjectKey:
            'crm-email/inbound/2026/07/30/55555555-5555-4555-8555-555555555555/attachments/01.bin'
        }]
      }
    ],
    [
      'an invalid raw MIME hash',
      { rawMimeSha256: 'not-a-hash' }
    ],
    [
      'an oversized attachment',
      {
        attachments: [{
          ...validBody().attachments[0],
          byteSize: 5 * 1024 * 1024 + 1
        }]
      }
    ],
    [
      'more than ten attachments',
      {
        attachments: Array.from({ length: 11 }, (_, index) => ({
          ...validBody().attachments[0],
          r2ObjectKey:
            `${R2_PREFIX}/attachments/${String(index + 1).padStart(2, '0')}.bin`
        }))
      }
    ],
    [
      'attachment bytes in the boundary payload',
      {
        attachments: [{
          ...validBody().attachments[0],
          content: 'must-not-cross-the-boundary'
        }]
      }
    ]
  ])('rejects %s', async (_label, override) => {
    const request = event({ ...validBody(), ...override })

    await expect(inboundEndpoint(request)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid CRM email inbound payload'
    })
    expect(mockResolveRoute).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('uses the same generic not-found response for invalid or absent routes', async () => {
    mockResolveRoute.mockResolvedValue(null)
    const request = event()

    await expect(inboundEndpoint(request)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'CRM email route not found'
    })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('fails closed when the dedicated Queue cannot accept the job', async () => {
    mockEnqueue.mockRejectedValue(
      new Error('CRM_EMAIL_INBOUND_QUEUE binding unavailable')
    )
    const request = event()

    await expect(inboundEndpoint(request)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'CRM email inbound queue unavailable'
    })
  })

  it('returns only a 202 acknowledgement and queues tenant identity derived from the route', async () => {
    const request = event()

    const response = await inboundEndpoint(request)
    expect(response).toEqual({
      accepted: true
    })
    expect(request.status).toBe(202)
    expect(mockResolveRoute).toHaveBeenCalledWith({
      routeKind: 'conversation_reply',
      routeToken: ROUTE_TOKEN,
      recipientDomain: 'reply.xeroflow.io',
      secrets: { 1: REPLY_SECRET }
    })
    expect(mockEnqueue).toHaveBeenCalledWith(request, {
      version: 1,
      type: 'crm.email.inbound',
      idempotencyKey: expect.stringMatching(/^crm-inbound:[a-f0-9]{64}$/),
      routeId: ROUTE_ID,
      clientId: CLIENT_ID,
      conversationId: CONVERSATION_ID,
      routeKind: 'conversation_reply',
      provider: 'cloudflare_email',
      providerMessageId: '<provider-message@example.net>',
      rawMimeR2Key: `${R2_PREFIX}/message.eml`,
      rawMimeSha256: 'd'.repeat(64),
      rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
      attachments: [{
        r2ObjectKey: `${R2_PREFIX}/attachments/01.bin`,
        filename: 'Customer Contract.pdf',
        contentType: 'application/pdf',
        byteSize: 1024,
        sha256: 'e'.repeat(64),
        contentId: '<contract@example.net>'
      }],
      receivedAt: '2026-07-30T05:30:00.000Z'
    })
    expect(JSON.stringify(response)).not.toContain(CLIENT_ID)
    expect(JSON.stringify(response)).not.toContain(ROUTE_TOKEN)
  })

  it('uses the same downstream idempotency key for a retried request', async () => {
    await inboundEndpoint(event())
    await inboundEndpoint(event())

    const firstJob = mockEnqueue.mock.calls[0]![1]
    const secondJob = mockEnqueue.mock.calls[1]![1]
    expect(firstJob.idempotencyKey).toBe(secondJob.idempotencyKey)
  })
})

afterAll(() => {
  process.env = oldEnv
})
