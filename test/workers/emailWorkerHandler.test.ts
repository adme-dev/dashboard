import { describe, expect, it, vi } from 'vitest'
import { createInboundEmailWorker } from '../../workers/email-worker/src/index'
import type {
  InboundEmailMessage,
  ParsedInboundEmail
} from '../../workers/email-worker/src/contracts'

const MiB = 1024 * 1024
const BOARD_TOKEN = '0123456789abcdef'
const SIGNED_TOKEN = `v2.${'A'.repeat(22)}.${'B'.repeat(27)}`
const env = {
  API_URL: 'https://app.xeroflow.io',
  INTERNAL_API_KEY: 'internal-secret'
}
const parsedEmail: ParsedInboundEmail = {
  subject: 'Website update',
  text: 'Please update the website.',
  html: '<p>Please update the website.</p>',
  messageId: '<provider-message@example.net>',
  automationSignals: {
    autoSubmitted: null,
    contentType: 'text/plain',
    listId: null,
    precedence: null,
    xXeroFlowOrigin: null,
    returnPath: 'customer@example.com'
  },
  attachments: []
}

function createMessage(
  to: string,
  rawSize = 1024,
  rawContent = 'raw mime'
) {
  let rawAccesses = 0
  const rejections: string[] = []
  const message = {
    from: 'customer@example.com',
    to,
    rawSize,
    get raw() {
      rawAccesses += 1
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(rawContent))
          controller.close()
        }
      })
    },
    setReject(reason: string) {
      rejections.push(reason)
    }
  } as InboundEmailMessage

  return {
    message,
    rejections,
    rawAccesses: () => rawAccesses
  }
}

describe('guarded inbound email Worker', () => {
  it.each([
    ['unknown@example.com', 'Invalid email route'],
    [`lead+${SIGNED_TOKEN}@mail.xeroflow.io`, 'Email route not enabled'],
    [`reply+${SIGNED_TOKEN}@reply.xeroflow.io`, 'Email route not enabled']
  ])('rejects %s before reading or parsing MIME', async (recipient, reason) => {
    const parse = vi.fn().mockResolvedValue(parsedEmail)
    const fetch = vi.fn()
    const state = createMessage(recipient)
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, env)

    expect(state.rejections).toEqual([reason])
    expect(state.rawAccesses()).toBe(0)
    expect(parse).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects an oversized message before reading or parsing MIME', async () => {
    const parse = vi.fn().mockResolvedValue(parsedEmail)
    const fetch = vi.fn()
    const state = createMessage(
      `board-${BOARD_TOKEN}@mail.xeroflow.io`,
      10 * MiB + 1
    )
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, env)

    expect(state.rejections).toEqual(['Email exceeds size limit'])
    expect(state.rawAccesses()).toBe(0)
    expect(parse).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects enabled CRM routes before MIME access when bindings are incomplete', async () => {
    const parse = vi.fn().mockResolvedValue(parsedEmail)
    const fetch = vi.fn()
    const state = createMessage(
      `lead+${SIGNED_TOKEN}@mail.xeroflow.io`
    )
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, {
      ...env,
      CRM_EMAIL_INBOUND_ENABLED: 'true'
    })

    expect(state.rejections).toEqual(['Email route not configured'])
    expect(state.rawAccesses()).toBe(0)
    expect(parse).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads and parses a valid board message once before delivery', async () => {
    const parse = vi.fn().mockResolvedValue(parsedEmail)
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const state = createMessage(`board-${BOARD_TOKEN}@mail.xeroflow.io`)
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, env)

    expect(state.rejections).toEqual([])
    expect(state.rawAccesses()).toBe(1)
    expect(parse).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects unsafe parsed attachments before calling Nitro', async () => {
    const parse = vi.fn().mockResolvedValue({
      ...parsedEmail,
      attachments: [{
        filename: 'oversized.pdf',
        mimeType: 'application/pdf',
        size: 5 * MiB + 1
      }]
    })
    const fetch = vi.fn()
    const state = createMessage(`board-${BOARD_TOKEN}@mail.xeroflow.io`)
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, env)

    expect(state.rejections).toEqual(['Unsafe email attachments'])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stores and enqueues an enabled CRM lead without a global HTTP handoff', async () => {
    const content = new TextEncoder().encode('attachment bytes').buffer
    const parse = vi.fn().mockResolvedValue({
      ...parsedEmail,
      attachments: [{
        filename: 'details.txt',
        mimeType: 'text/plain',
        size: content.byteLength,
        content,
        contentId: null
      }]
    })
    const fetch = vi.fn()
    const send = vi.fn().mockResolvedValue(undefined)
    const put = vi.fn().mockResolvedValue({ key: 'stored' })
    const deleteObjects = vi.fn().mockResolvedValue(undefined)
    const state = createMessage(
      `lead+${SIGNED_TOKEN}@mail.xeroflow.io`
    )
    const worker = createInboundEmailWorker({
      parse,
      fetch,
      now: () => new Date('2026-07-30T05:30:00.000Z'),
      randomUUID: () => '11111111-1111-4111-8111-111111111111'
    })

    await worker.email(state.message, {
      ...env,
      CRM_EMAIL_INBOUND_ENABLED: 'true',
      CRM_EMAIL_WORKER_SECRET: 'worker-secret',
      CRM_EMAIL_BUCKET: { put, delete: deleteObjects, get: vi.fn() },
      CRM_EMAIL_RETAINED_QUEUE: { send }
    })

    expect(state.rejections).toEqual([])
    expect(state.rawAccesses()).toBe(1)
    expect(parse).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledTimes(2)
    expect(fetch).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      version: 1,
      type: 'crm.email.retained',
      routeKind: 'lead_inbox',
      routeToken: SIGNED_TOKEN,
      recipientDomain: 'mail.xeroflow.io',
      provider: 'cloudflare_email',
      providerMessageId: '<provider-message@example.net>',
      rawMimeR2Key:
        'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111/message.eml',
      attachments: [expect.objectContaining({
        r2ObjectKey:
          'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111/attachments/01.bin',
        filename: 'details.txt',
        contentType: 'text/plain',
        byteSize: content.byteLength
      })]
    }))
    expect(send.mock.calls[0]![0].attachments[0]).not.toHaveProperty('content')
    expect(deleteObjects).not.toHaveBeenCalled()
  })

  it.each([
    ['xeroflow_loop', {
      xXeroFlowOrigin: 'crm-email-gateway'
    }],
    ['delivery_status', {
      contentType: 'multipart/report; report-type=delivery-status'
    }],
    ['auto_submitted', {
      autoSubmitted: 'auto-replied'
    }],
    ['mailing_list', {
      listId: 'Updates <updates.example.net>'
    }]
  ])('silently suppresses CRM %s mail before R2 storage', async (
    reason,
    automationSignals
  ) => {
    const parse = vi.fn().mockResolvedValue({
      ...parsedEmail,
      automationSignals: {
        ...parsedEmail.automationSignals,
        ...automationSignals
      }
    })
    const fetch = vi.fn()
    const put = vi.fn()
    const deleteObjects = vi.fn()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const state = createMessage(
      `lead+${SIGNED_TOKEN}@mail.xeroflow.io`
    )
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, {
      ...env,
      CRM_EMAIL_INBOUND_ENABLED: 'true',
      CRM_EMAIL_WORKER_SECRET: 'worker-secret',
      CRM_EMAIL_BUCKET: { put, delete: deleteObjects, get: vi.fn() },
      CRM_EMAIL_RETAINED_QUEUE: { send: vi.fn() }
    })

    expect(state.rejections).toEqual([])
    expect(state.rawAccesses()).toBe(1)
    expect(parse).toHaveBeenCalledOnce()
    expect(put).not.toHaveBeenCalled()
    expect(deleteObjects).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith(
      'CRM email inbound suppressed',
      { reason }
    )
    expect(JSON.stringify(info.mock.calls)).not.toContain(
      'customer@example.com'
    )
    expect(JSON.stringify(info.mock.calls)).not.toContain(SIGNED_TOKEN)
    info.mockRestore()
  })

  it('leaves existing board ingestion unchanged for automatic mail', async () => {
    const parse = vi.fn().mockResolvedValue({
      ...parsedEmail,
      automationSignals: {
        ...parsedEmail.automationSignals,
        autoSubmitted: 'auto-replied'
      }
    })
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const state = createMessage(`board-${BOARD_TOKEN}@mail.xeroflow.io`)
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, env)

    expect(state.rejections).toEqual([])
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('suppresses automatic CRM mail before unsafe attachment rejection', async () => {
    const parse = vi.fn().mockResolvedValue({
      ...parsedEmail,
      automationSignals: {
        ...parsedEmail.automationSignals,
        autoSubmitted: 'auto-replied'
      },
      attachments: [{
        filename: 'oversized.pdf',
        mimeType: 'application/pdf',
        size: 5 * MiB + 1
      }]
    })
    const fetch = vi.fn()
    const put = vi.fn()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const state = createMessage(
      `lead+${SIGNED_TOKEN}@mail.xeroflow.io`
    )
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, {
      ...env,
      CRM_EMAIL_INBOUND_ENABLED: 'true',
      CRM_EMAIL_WORKER_SECRET: 'worker-secret',
      CRM_EMAIL_BUCKET: { put, delete: vi.fn(), get: vi.fn() },
      CRM_EMAIL_RETAINED_QUEUE: { send: vi.fn() }
    })

    expect(state.rejections).toEqual([])
    expect(put).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith(
      'CRM email inbound suppressed',
      { reason: 'auto_submitted' }
    )
    info.mockRestore()
  })

  it('does not store CRM artifacts when parsed attachments are unsafe', async () => {
    const content = new ArrayBuffer(5 * MiB + 1)
    const parse = vi.fn().mockResolvedValue({
      ...parsedEmail,
      attachments: [{
        filename: 'oversized.pdf',
        mimeType: 'application/pdf',
        size: content.byteLength,
        content
      }]
    })
    const fetch = vi.fn()
    const put = vi.fn()
    const state = createMessage(
      `reply+${SIGNED_TOKEN}@reply.xeroflow.io`
    )
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, {
      ...env,
      CRM_EMAIL_INBOUND_ENABLED: 'true',
      CRM_EMAIL_WORKER_SECRET: 'worker-secret',
      CRM_EMAIL_BUCKET: { put, delete: vi.fn(), get: vi.fn() },
      CRM_EMAIL_RETAINED_QUEUE: { send: vi.fn() }
    })

    expect(state.rejections).toEqual(['Unsafe email attachments'])
    expect(put).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('deletes CRM artifacts when Queue enqueue fails', async () => {
    const parse = vi.fn().mockResolvedValue(parsedEmail)
    const fetch = vi.fn()
    const send = vi.fn().mockRejectedValue(new Error('queue unavailable'))
    const put = vi.fn().mockResolvedValue({ key: 'stored' })
    const deleteObjects = vi.fn().mockResolvedValue(undefined)
    const state = createMessage(
      `reply+${SIGNED_TOKEN}@reply.xeroflow.io`
    )
    const worker = createInboundEmailWorker({
      parse,
      fetch,
      now: () => new Date('2026-07-30T05:30:00.000Z'),
      randomUUID: () => '11111111-1111-4111-8111-111111111111'
    })

    await worker.email(state.message, {
      ...env,
      CRM_EMAIL_INBOUND_ENABLED: 'true',
      CRM_EMAIL_WORKER_SECRET: 'worker-secret',
      CRM_EMAIL_BUCKET: { put, delete: deleteObjects, get: vi.fn() },
      CRM_EMAIL_RETAINED_QUEUE: { send }
    })

    expect(state.rejections).toEqual(['Internal error processing email'])
    expect(fetch).not.toHaveBeenCalled()
    expect(deleteObjects).toHaveBeenCalledWith([
      'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111/message.eml'
    ])
  })

  it('does not log Queue error details or signed routes', async () => {
    const parse = vi.fn().mockResolvedValue(parsedEmail)
    const fetch = vi.fn()
    const send = vi.fn().mockRejectedValue(new Error('queue-secret-detail'))
    const put = vi.fn().mockResolvedValue({ key: 'stored' })
    const deleteObjects = vi.fn().mockResolvedValue(undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = createMessage(
      `lead+${SIGNED_TOKEN}@mail.xeroflow.io`
    )
    const worker = createInboundEmailWorker({
      parse,
      fetch,
      now: () => new Date('2026-07-30T05:30:00.000Z'),
      randomUUID: () => '11111111-1111-4111-8111-111111111111'
    })

    await worker.email(state.message, {
      ...env,
      CRM_EMAIL_INBOUND_ENABLED: 'true',
      CRM_EMAIL_WORKER_SECRET: 'worker-secret',
      CRM_EMAIL_BUCKET: { put, delete: deleteObjects, get: vi.fn() },
      CRM_EMAIL_RETAINED_QUEUE: { send }
    })

    expect(state.rejections).toEqual(['Internal error processing email'])
    expect(deleteObjects).toHaveBeenCalledWith([
      'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111/message.eml'
    ])
    expect(JSON.stringify(error.mock.calls)).not.toContain(SIGNED_TOKEN)
    expect(JSON.stringify(error.mock.calls)).not.toContain('queue-secret-detail')
    error.mockRestore()
  })

  it('retains PostalMime attachment bytes until the R2 write completes', async () => {
    const rawMime = [
      'From: Customer <customer@example.com>',
      `To: lead+${SIGNED_TOKEN}@mail.xeroflow.io`,
      'Subject: Website enquiry',
      'Message-ID: <mime-message@example.com>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="boundary"',
      '',
      '--boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Please contact me.',
      '--boundary',
      'Content-Type: text/plain',
      'Content-Disposition: attachment; filename="details.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      'SGVsbG8=',
      '--boundary--',
      ''
    ].join('\r\n')
    const fetch = vi.fn()
    const send = vi.fn().mockResolvedValue(undefined)
    const put = vi.fn().mockResolvedValue({ key: 'stored' })
    const state = createMessage(
      `lead+${SIGNED_TOKEN}@mail.xeroflow.io`,
      new TextEncoder().encode(rawMime).byteLength,
      rawMime
    )
    const worker = createInboundEmailWorker({
      fetch,
      now: () => new Date('2026-07-30T05:30:00.000Z'),
      randomUUID: () => '11111111-1111-4111-8111-111111111111'
    })

    await worker.email(state.message, {
      ...env,
      CRM_EMAIL_INBOUND_ENABLED: 'true',
      CRM_EMAIL_WORKER_SECRET: 'worker-secret',
      CRM_EMAIL_BUCKET: { put, delete: vi.fn(), get: vi.fn() },
      CRM_EMAIL_RETAINED_QUEUE: { send }
    })

    expect(state.rejections).toEqual([])
    expect(put).toHaveBeenCalledTimes(2)
    const attachmentBytes = new Uint8Array(put.mock.calls[1]![1])
    expect(new TextDecoder().decode(attachmentBytes)).toBe('Hello')
    expect(fetch).not.toHaveBeenCalled()
    const retainedJob = send.mock.calls[0]![0]
    expect(retainedJob.providerMessageId).toBe('<mime-message@example.com>')
    expect(retainedJob.attachments[0]).toMatchObject({
      filename: 'details.txt',
      byteSize: 5
    })
  })

  it('fails closed without logging message content when MIME parsing fails', async () => {
    const sensitiveBody = 'customer-secret-body'
    const parse = vi.fn().mockRejectedValue(new Error(sensitiveBody))
    const fetch = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = createMessage(`board-${BOARD_TOKEN}@mail.xeroflow.io`)
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, env)

    expect(state.rejections).toEqual(['Internal error processing email'])
    expect(error).toHaveBeenCalledWith('Email worker processing failed', {
      stage: 'parse_mime'
    })
    expect(JSON.stringify(error.mock.calls)).not.toContain(sensitiveBody)
    expect(JSON.stringify(error.mock.calls)).not.toContain(BOARD_TOKEN)
    error.mockRestore()
  })

  it('rejects downstream failure without reading or logging its response body', async () => {
    const sensitiveBody = 'downstream-secret-detail'
    const response = new Response(sensitiveBody, { status: 503 })
    const text = vi.spyOn(response, 'text')
    const parse = vi.fn().mockResolvedValue(parsedEmail)
    const fetch = vi.fn().mockResolvedValue(response)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = createMessage(`board-${BOARD_TOKEN}@mail.xeroflow.io`)
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, env)

    expect(state.rejections).toEqual(['Failed to process email: 503'])
    expect(text).not.toHaveBeenCalled()
    expect(JSON.stringify(error.mock.calls)).not.toContain(sensitiveBody)
    expect(JSON.stringify(error.mock.calls)).not.toContain(BOARD_TOKEN)
    error.mockRestore()
  })
})
