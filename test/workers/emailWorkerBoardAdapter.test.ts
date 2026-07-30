import { describe, expect, it, vi } from 'vitest'
import { deliverBoardEmail } from '../../workers/email-worker/src/boardAdapter'
import type { ParsedInboundEmail } from '../../workers/email-worker/src/contracts'

const parsedEmail: ParsedInboundEmail = {
  subject: 'Website update',
  text: 'Please update the website.',
  html: '<p>Please update the website.</p>',
  automationSignals: {
    autoSubmitted: null,
    contentType: 'text/plain',
    listId: null,
    precedence: null,
    xXeroFlowOrigin: null,
    returnPath: 'customer@example.com'
  },
  attachments: [
    {
      filename: 'brief.pdf',
      mimeType: 'application/pdf',
      size: 2048
    }
  ]
}

describe('email-to-board delivery adapter', () => {
  it('preserves the existing Nitro request contract', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await expect(deliverBoardEmail({
      token: '0123456789abcdef',
      from: 'customer@example.com',
      email: parsedEmail,
      apiUrl: 'https://app.xeroflow.io/',
      internalApiKey: 'internal-secret'
    }, { fetch })).resolves.toEqual({ accepted: true, status: 200 })

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://app.xeroflow.io/api/internal/email-to-board')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Authorization': 'Bearer internal-secret',
        'Content-Type': 'application/json'
      }
    })
    expect(JSON.parse(String(init.body))).toEqual({
      boardToken: '0123456789abcdef',
      from: 'customer@example.com',
      subject: 'Website update',
      textBody: 'Please update the website.',
      htmlBody: '<p>Please update the website.</p>',
      attachments: [
        {
          filename: 'brief.pdf',
          contentType: 'application/pdf',
          size: 2048
        }
      ]
    })
  })

  it('preserves the no-subject default and empty content defaults', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await deliverBoardEmail({
      token: '0123456789abcdef',
      from: 'customer@example.com',
      email: {
        subject: null,
        text: null,
        html: null,
        automationSignals: {
          autoSubmitted: null,
          contentType: null,
          listId: null,
          precedence: null,
          xXeroFlowOrigin: null,
          returnPath: null
        },
        attachments: []
      },
      apiUrl: 'https://app.xeroflow.io',
      internalApiKey: 'internal-secret'
    }, { fetch })

    const [, init] = fetch.mock.calls[0]!
    expect(JSON.parse(String(init.body))).toMatchObject({
      subject: '(No Subject)',
      textBody: '',
      htmlBody: '',
      attachments: []
    })
  })

  it('returns the downstream status without reading or exposing its response body', async () => {
    const response = new Response('sensitive downstream detail', { status: 503 })
    const text = vi.spyOn(response, 'text')
    const fetch = vi.fn().mockResolvedValue(response)

    await expect(deliverBoardEmail({
      token: '0123456789abcdef',
      from: 'customer@example.com',
      email: parsedEmail,
      apiUrl: 'https://app.xeroflow.io',
      internalApiKey: 'internal-secret'
    }, { fetch })).resolves.toEqual({ accepted: false, status: 503 })
    expect(text).not.toHaveBeenCalled()
  })
})
