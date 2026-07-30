import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  body?: unknown
  context: {
    cloudflare?: {
      env?: Record<string, unknown>
    }
  }
}

const SECRET = 'worker-shared-secret'
const mockReadBody = vi.fn(async (event: TestEvent) => event.body)
const mockProcess = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getHeader: (event: TestEvent, name: string) =>
    event.headers?.[name.toLowerCase()] ?? event.headers?.[name],
  readBody: (event: TestEvent) => mockReadBody(event),
  createError: (input: { statusCode: number, statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input)
}))

vi.mock('~~/server/utils/crm/emailInboundProcessor', () => ({
  processCrmInboundEmail: (...args: unknown[]) => mockProcess(...args)
}))

const oldEnv = { ...process.env }
const { default: handler } = await import(
  '../../../server/api/internal/crm-email/process-inbound.post'
)
const processEndpoint = handler as (
  event: TestEvent
) => Promise<{ accepted: true, duplicate: boolean }>

const R2_PREFIX
  = 'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111'

function validBody() {
  return {
    job: {
      version: 1,
      type: 'crm.email.inbound',
      idempotencyKey: `crm-inbound:${'a'.repeat(64)}`,
      routeId: '22222222-2222-4222-8222-222222222222',
      clientId: '33333333-3333-4333-8333-333333333333',
      conversationId: null,
      routeKind: 'lead_inbox',
      provider: 'cloudflare_email',
      providerMessageId: '<provider-message@example.net>',
      rawMimeR2Key: `${R2_PREFIX}/message.eml`,
      rawMimeSha256: 'b'.repeat(64),
      rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
      attachments: [],
      receivedAt: '2026-07-30T05:30:00.000Z'
    },
    email: {
      from: {
        address: 'customer@example.com',
        name: 'Customer Name'
      },
      to: [{
        address: 'lead+opaque@mail.xeroflow.io',
        name: null
      }],
      cc: [],
      replyTo: [],
      subject: 'Vehicle enquiry',
      text: 'Please contact me.',
      internetMessageId: '<provider-message@example.net>',
      inReplyTo: null,
      references: []
    }
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
          ...overrides
        }
      }
    }
  }
}

describe('CRM email process-inbound internal endpoint', () => {
  beforeEach(() => {
    process.env = { ...oldEnv }
    delete process.env.CRM_EMAIL_WORKER_SECRET
    delete process.env.CRM_EMAIL_CONVERSATIONS_ENABLED
    vi.clearAllMocks()
    mockProcess.mockResolvedValue({ status: 'created' })
  })

  it('fails closed before body access when Worker auth is unconfigured', async () => {
    await expect(processEndpoint(event(validBody(), {
      CRM_EMAIL_WORKER_SECRET: undefined
    }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'CRM email Worker authentication is not configured'
    })
    expect(mockReadBody).not.toHaveBeenCalled()
  })

  it('rejects the wrong Worker secret before body access', async () => {
    const request = event()
    request.headers = { 'x-crm-email-secret': 'wrong-secret' }

    await expect(processEndpoint(request)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
    expect(mockReadBody).not.toHaveBeenCalled()
  })

  it('stays inert while CRM email conversations are disabled', async () => {
    await expect(processEndpoint(event(validBody(), {
      CRM_EMAIL_CONVERSATIONS_ENABLED: 'false'
    }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'CRM email conversations are disabled'
    })
    expect(mockReadBody).not.toHaveBeenCalled()
  })

  it('rejects malformed content without invoking the processor', async () => {
    const body = validBody() as Record<string, unknown>
    body.html = '<p>must not cross the boundary</p>'

    await expect(processEndpoint(event(body))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid CRM email processing payload'
    })
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it.each([
    ['created', false],
    ['duplicate', true]
  ] as const)(
    'returns a minimal response for a %s message',
    async (status, duplicate) => {
      mockProcess.mockResolvedValue({ status })
      const request = event()

      await expect(processEndpoint(request)).resolves.toEqual({
        accepted: true,
        duplicate
      })
      expect(mockProcess).toHaveBeenCalledWith(validBody())
      expect(JSON.stringify(await processEndpoint(event()))).not.toContain(
        'customer@example.com'
      )
    }
  )

  it('returns one generic conflict when the route is no longer usable', async () => {
    mockProcess.mockResolvedValue({ status: 'route_unavailable' })

    await expect(processEndpoint(event())).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'CRM email route is unavailable'
    })
  })
})

afterAll(() => {
  process.env = oldEnv
})
