import { describe, expect, it, vi } from 'vitest'
import {
  processCrmInboundQueueJob
} from '../../workers/email-worker/src/inboundQueue'
import {
  createInboundEmailWorker
} from '../../workers/email-worker/src/index'
import type {
  CrmEmailInboundQueueJob,
  CrmEmailRetainedArtifactJob
} from '../../server/utils/crm/emailInboundProcessingContracts'
import type {
  InboundEmailWorkerEnv,
  ParsedInboundEmail
} from '../../workers/email-worker/src/contracts'

const RAW_MIME_KEY
  = 'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111/message.eml'
const RAW_SHA256
  = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

function job(
  overrides: Partial<CrmEmailInboundQueueJob> = {}
): CrmEmailInboundQueueJob {
  return {
    version: 1,
    type: 'crm.email.inbound',
    idempotencyKey: `crm-inbound:${'a'.repeat(64)}`,
    routeId: '22222222-2222-4222-8222-222222222222',
    clientId: '33333333-3333-4333-8333-333333333333',
    conversationId: null,
    routeKind: 'lead_inbox',
    provider: 'cloudflare_email',
    providerMessageId: '<provider-message@example.net>',
    rawMimeR2Key: RAW_MIME_KEY,
    rawMimeSha256: RAW_SHA256,
    rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
    attachments: [],
    receivedAt: '2026-07-30T05:30:00.000Z',
    ...overrides
  }
}

function retainedJob(
  overrides: Partial<CrmEmailRetainedArtifactJob> = {}
): CrmEmailRetainedArtifactJob {
  return {
    version: 1,
    type: 'crm.email.retained',
    routeKind: 'lead_inbox',
    routeToken: `v1.${'A'.repeat(22)}.${'B'.repeat(27)}`,
    recipientDomain: 'mail.xeroflow.io',
    provider: 'cloudflare_email',
    providerMessageId: '<provider-message@example.net>',
    rawMimeR2Key: RAW_MIME_KEY,
    rawMimeSha256: RAW_SHA256,
    rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
    attachments: [],
    receivedAt: '2026-07-30T05:30:00.000Z',
    ...overrides
  }
}

function parsed(
  overrides: Partial<ParsedInboundEmail> = {}
): ParsedInboundEmail {
  return {
    from: {
      name: 'Jane Citizen',
      address: ' Jane@Example.com '
    },
    to: [{
      name: '',
      address: 'lead+opaque@mail.xeroflow.io'
    }],
    cc: [],
    replyTo: [{
      name: 'Jane Citizen',
      address: 'reply@example.com'
    }],
    subject: ' Vehicle enquiry ',
    text: 'Please contact me.',
    html: '<script>not allowed</script><p>Please contact me.</p>',
    messageId: '<provider-message@example.net>',
    inReplyTo: '<previous@example.net>',
    references: '<root@example.net> <previous@example.net>',
    automationSignals: {
      autoSubmitted: null,
      contentType: 'text/plain',
      listId: null,
      precedence: null,
      xXeroFlowOrigin: null,
      returnPath: 'jane@example.com'
    },
    attachments: [],
    ...overrides
  }
}

function bucket() {
  return {
    put: vi.fn(),
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({
      size: 5,
      arrayBuffer: vi.fn().mockResolvedValue(
        new TextEncoder().encode('hello').buffer
      )
    })
  }
}

function env(
  overrides: Partial<InboundEmailWorkerEnv> = {}
): InboundEmailWorkerEnv {
  return {
    API_URL: 'https://app.xeroflow.io',
    INTERNAL_API_KEY: 'board-secret',
    CRM_EMAIL_INBOUND_ENABLED: 'true',
    CRM_EMAIL_WORKER_SECRET: 'worker-secret',
    CRM_EMAIL_BUCKET: bucket(),
    ...overrides
  }
}

describe('CRM email inbound Queue processor', () => {
  it('resolves a signed retained-artifact job before canonical processing', async () => {
    const process = vi.fn().mockResolvedValue({ status: 'created' })
    const resolveRoute = vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      clientId: '33333333-3333-4333-8333-333333333333',
      conversationId: null,
      routeKind: 'lead_inbox',
      tokenVersion: 1,
      recipientDomain: 'mail.xeroflow.io',
      routeTokenHash: 'c'.repeat(64)
    })
    const createIdempotencyKey = vi.fn().mockResolvedValue(
      `crm-inbound:${'d'.repeat(64)}`
    )

    await expect(processCrmInboundQueueJob(
      retainedJob() as never,
      env(),
      {
        parse: vi.fn().mockResolvedValue(parsed()),
        process,
        resolveRoute,
        createIdempotencyKey
      }
    )).resolves.toEqual({ status: 'processed', duplicate: false })

    expect(resolveRoute).toHaveBeenCalledWith({
      routeKind: 'lead_inbox',
      routeToken: retainedJob().routeToken,
      recipientDomain: 'mail.xeroflow.io'
    })
    expect(createIdempotencyKey).toHaveBeenCalledWith(
      'c'.repeat(64),
      '<provider-message@example.net>'
    )
    expect(process).toHaveBeenCalledWith(expect.objectContaining({
      job: expect.objectContaining({
        type: 'crm.email.inbound',
        idempotencyKey: `crm-inbound:${'d'.repeat(64)}`,
        routeId: '22222222-2222-4222-8222-222222222222',
        clientId: '33333333-3333-4333-8333-333333333333'
      })
    }))
  })

  it('acknowledges an unavailable signed route only after exact artifact cleanup', async () => {
    const inputEnv = env()
    const process = vi.fn()

    await expect(processCrmInboundQueueJob(
      retainedJob(),
      inputEnv,
      {
        parse: vi.fn(),
        process,
        resolveRoute: vi.fn().mockResolvedValue(null),
        createIdempotencyKey: vi.fn()
      }
    )).resolves.toEqual({ status: 'route_unavailable' })

    expect(inputEnv.CRM_EMAIL_BUCKET?.delete).toHaveBeenCalledWith([
      RAW_MIME_KEY
    ])
    expect(process).not.toHaveBeenCalled()
  })

  it('deletes only the redundant retained artifacts after duplicate processing', async () => {
    const inputEnv = env()

    await expect(processCrmInboundQueueJob(
      job(),
      inputEnv,
      {
        parse: vi.fn().mockResolvedValue(parsed()),
        process: vi.fn().mockResolvedValue({ status: 'duplicate' })
      }
    )).resolves.toEqual({ status: 'processed', duplicate: true })

    expect(inputEnv.CRM_EMAIL_BUCKET?.delete).toHaveBeenCalledWith([
      RAW_MIME_KEY
    ])
  })

  it.each([
    ['disabled', { CRM_EMAIL_INBOUND_ENABLED: 'false' }],
    ['missing secret', { CRM_EMAIL_WORKER_SECRET: undefined }],
    ['missing R2', { CRM_EMAIL_BUCKET: undefined }],
    ['missing API URL', { API_URL: '' }]
  ])('fails closed when %s', async (_label, override) => {
    const fetch = vi.fn()
    const parse = vi.fn()
    const inputEnv = env(override)

    await expect(processCrmInboundQueueJob(
      job(),
      inputEnv,
      { fetch, parse }
    )).rejects.toThrow('CRM email inbound Queue is not configured')

    if (inputEnv.CRM_EMAIL_BUCKET) {
      expect(inputEnv.CRM_EMAIL_BUCKET.get).not.toHaveBeenCalled()
    }
    expect(parse).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('verifies retained MIME and invokes direct processing without global HTTP', async () => {
    const inputEnv = env()
    const parse = vi.fn().mockResolvedValue(parsed())
    const fetch = vi.fn()
    const process = vi.fn().mockResolvedValue({ status: 'created' })

    await expect(processCrmInboundQueueJob(
      job(),
      inputEnv,
      { fetch, parse, process }
    )).resolves.toEqual({ status: 'processed', duplicate: false })

    expect(inputEnv.CRM_EMAIL_BUCKET?.get).toHaveBeenCalledWith(RAW_MIME_KEY)
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ byteLength: 5 })
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(process).toHaveBeenCalledOnce()
    expect(process).toHaveBeenCalledWith({
      job: job(),
      email: {
        from: {
          name: 'Jane Citizen',
          address: 'jane@example.com'
        },
        to: [{
          name: null,
          address: 'lead+opaque@mail.xeroflow.io'
        }],
        cc: [],
        replyTo: [{
          name: 'Jane Citizen',
          address: 'reply@example.com'
        }],
        subject: 'Vehicle enquiry',
        text: 'Please contact me.',
        internetMessageId: '<provider-message@example.net>',
        inReplyTo: '<previous@example.net>',
        references: [
          '<root@example.net>',
          '<previous@example.net>'
        ]
      }
    })
    const body = process.mock.calls[0]![0]
    expect(JSON.stringify(body)).not.toContain('<script>')
    expect(body.email).not.toHaveProperty('html')
    expect(body.email).not.toHaveProperty('raw')
    expect(body.email).not.toHaveProperty('attachments')
  })

  it('rejects a checksum mismatch before MIME parsing or Nitro handoff', async () => {
    const inputEnv = env()
    const parse = vi.fn()
    const fetch = vi.fn()

    await expect(processCrmInboundQueueJob(
      job({ rawMimeSha256: 'b'.repeat(64) }),
      inputEnv,
      { fetch, parse }
    )).rejects.toThrow('CRM email raw MIME checksum mismatch')

    expect(parse).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a missing retained MIME object before parsing', async () => {
    const inputEnv = env()
    vi.mocked(inputEnv.CRM_EMAIL_BUCKET!.get).mockResolvedValue(null)
    const parse = vi.fn()

    await expect(processCrmInboundQueueJob(
      job(),
      inputEnv,
      { fetch: vi.fn(), parse }
    )).rejects.toThrow('CRM email raw MIME object is unavailable')

    expect(parse).not.toHaveBeenCalled()
  })

  it('rejects a raw MIME object above the approved size limit', async () => {
    const inputEnv = env()
    const oversized = new ArrayBuffer(10 * 1024 * 1024 + 1)
    vi.mocked(inputEnv.CRM_EMAIL_BUCKET!.get).mockResolvedValue({
      size: oversized.byteLength,
      arrayBuffer: vi.fn().mockResolvedValue(oversized)
    })
    const parse = vi.fn()

    await expect(processCrmInboundQueueJob(
      job(),
      inputEnv,
      { fetch: vi.fn(), parse }
    )).rejects.toThrow('CRM email raw MIME object has invalid size')

    expect(parse).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a malformed sender',
      parsed({ from: { name: 'Jane', address: 'not-an-email' } })
    ],
    [
      'an oversized text body',
      parsed({ text: 'x'.repeat(512 * 1024 + 1) })
    ],
    [
      'too many recipients',
      parsed({
        to: Array.from({ length: 51 }, (_, index) => ({
          name: '',
          address: `person-${index}@example.com`
        }))
      })
    ]
  ])('rejects %s before the Nitro handoff', async (_label, email) => {
    const fetch = vi.fn()

    await expect(processCrmInboundQueueJob(
      job(),
      env(),
      { fetch, parse: vi.fn().mockResolvedValue(email) }
    )).rejects.toThrow('Invalid CRM email MIME envelope')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws on a non-success Nitro response so the Queue can retry', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('sensitive downstream detail', { status: 503 })
    )

    await expect(processCrmInboundQueueJob(
      job(),
      env(),
      { fetch, parse: vi.fn().mockResolvedValue(parsed()) }
    )).rejects.toThrow('CRM email inbound processing failed: 503')
  })

  it('suppresses an already-queued automatic response before Nitro', async () => {
    const fetch = vi.fn()
    const inputEnv = env()

    await expect(processCrmInboundQueueJob(
      job(),
      inputEnv,
      {
        fetch,
        parse: vi.fn().mockResolvedValue(parsed({
          automationSignals: {
            ...parsed().automationSignals,
            autoSubmitted: 'auto-replied'
          }
        }))
      }
    )).resolves.toEqual({
      status: 'suppressed',
      reason: 'auto_submitted'
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(inputEnv.CRM_EMAIL_BUCKET?.delete).toHaveBeenCalledWith([
      RAW_MIME_KEY
    ])
  })

  it('retries suppression when retained artifact deletion fails', async () => {
    const inputEnv = env()
    vi.mocked(inputEnv.CRM_EMAIL_BUCKET!.delete).mockRejectedValue(
      new Error('R2 unavailable')
    )

    await expect(processCrmInboundQueueJob(
      job(),
      inputEnv,
      {
        fetch: vi.fn(),
        parse: vi.fn().mockResolvedValue(parsed({
          automationSignals: {
            ...parsed().automationSignals,
            autoSubmitted: 'auto-replied'
          }
        }))
      }
    )).rejects.toThrow('R2 unavailable')
  })

  it('rejects a malformed Queue job before any R2 access', async () => {
    const inputEnv = env()

    await expect(processCrmInboundQueueJob(
      { ...job(), clientId: 'not-a-uuid' } as CrmEmailInboundQueueJob,
      inputEnv,
      { fetch: vi.fn(), parse: vi.fn() }
    )).rejects.toThrow('Invalid CRM email inbound Queue job')

    expect(inputEnv.CRM_EMAIL_BUCKET?.get).not.toHaveBeenCalled()
  })

  it('acknowledges successes and retries failures independently', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          accepted: true,
          duplicate: false
        }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    const worker = createInboundEmailWorker({
      fetch,
      parse: vi.fn().mockResolvedValue(parsed())
    })
    const first = {
      body: job(),
      ack: vi.fn(),
      retry: vi.fn()
    }
    const second = {
      body: job({
        idempotencyKey: `crm-inbound:${'d'.repeat(64)}`,
        providerMessageId: '<second@example.net>'
      }),
      ack: vi.fn(),
      retry: vi.fn()
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await worker.queue(
      { messages: [first, second] } as never,
      env(),
      {} as ExecutionContext
    )

    expect(first.ack).toHaveBeenCalledOnce()
    expect(first.retry).not.toHaveBeenCalled()
    expect(second.ack).not.toHaveBeenCalled()
    expect(second.retry).toHaveBeenCalledWith({ delaySeconds: 30 })
    expect(JSON.stringify(error.mock.calls)).not.toContain(
      'customer@example.com'
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain(RAW_MIME_KEY)
    error.mockRestore()
  })

  it('acknowledges a deterministic Queue suppression without retrying', async () => {
    const worker = createInboundEmailWorker({
      fetch: vi.fn(),
      parse: vi.fn().mockResolvedValue(parsed({
        automationSignals: {
          ...parsed().automationSignals,
          listId: 'Updates <updates.example.net>'
        }
      }))
    })
    const message = {
      body: job(),
      ack: vi.fn(),
      retry: vi.fn()
    }
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await worker.queue(
      { messages: [message] } as never,
      env(),
      {} as ExecutionContext
    )

    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith(
      'CRM email inbound suppressed',
      { reason: 'mailing_list' }
    )
    expect(JSON.stringify(info.mock.calls)).not.toContain(RAW_MIME_KEY)
    info.mockRestore()
  })
})
