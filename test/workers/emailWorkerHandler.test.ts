import { describe, expect, it, vi } from 'vitest'
import { createInboundEmailWorker } from '../../workers/email-worker/src/index'
import type {
  InboundEmailMessage,
  ParsedInboundEmail
} from '../../workers/email-worker/src/contracts'

const MiB = 1024 * 1024
const BOARD_TOKEN = '0123456789abcdef'
const SIGNED_TOKEN = `v2.${'A'.repeat(32)}.${'B'.repeat(43)}`
const env = {
  API_URL: 'https://app.xeroflow.io',
  INTERNAL_API_KEY: 'internal-secret'
}
const parsedEmail: ParsedInboundEmail = {
  subject: 'Website update',
  text: 'Please update the website.',
  html: '<p>Please update the website.</p>',
  attachments: []
}

function createMessage(to: string, rawSize = 1024) {
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
          controller.enqueue(new TextEncoder().encode('raw mime'))
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

  it('fails closed without logging message content when MIME parsing fails', async () => {
    const sensitiveBody = 'customer-secret-body'
    const parse = vi.fn().mockRejectedValue(new Error(sensitiveBody))
    const fetch = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = createMessage(`board-${BOARD_TOKEN}@mail.xeroflow.io`)
    const worker = createInboundEmailWorker({ parse, fetch })

    await worker.email(state.message, env)

    expect(state.rejections).toEqual(['Internal error processing email'])
    expect(error).toHaveBeenCalledWith('Email worker processing failed')
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
