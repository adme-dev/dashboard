import { describe, expect, it, vi } from 'vitest'
import {
  createTransactionalEmailWorker
} from '../../workers/transactional-email/src/index'

function request(body: unknown, path = '/v1/send') {
  return new Request(`https://transactional-email.internal${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

const message = {
  to: 'client@example.com',
  from: {
    address: 'notification@adme.net.au',
    name: 'XeroFlow Agency'
  },
  subject: 'Your secure portal sign-in link',
  text: 'Open the secure link.',
  html: '<p>Open the secure link.</p>'
}

describe('transactional email service Worker', () => {
  it('sends a bounded transactional message through the native binding', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'cf-message-1' })
    const worker = createTransactionalEmailWorker()

    const response = await worker.fetch(request(message), {
      EMAIL: { send } as unknown as SendEmail
    })

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      outcome: 'accepted',
      provider: 'cloudflare_email',
      providerMessageId: 'cf-message-1',
      errorClass: null
    })
    expect(send).toHaveBeenCalledWith({
      from: {
        email: 'notification@adme.net.au',
        name: 'XeroFlow Agency'
      },
      to: ['client@example.com'],
      cc: [],
      bcc: [],
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: {
        'X-XeroFlow-Origin': 'portal-auth'
      },
      attachments: []
    })
  })

  it('rejects unknown paths and methods without invoking Email Sending', async () => {
    const send = vi.fn()
    const worker = createTransactionalEmailWorker()
    const env = { EMAIL: { send } as unknown as SendEmail }

    const missing = await worker.fetch(request(message, '/unknown'), env)
    const method = await worker.fetch(new Request(
      'https://transactional-email.internal/v1/send',
      { method: 'GET' }
    ), env)

    expect(missing.status).toBe(404)
    expect(method.status).toBe(405)
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { ...message, to: 'not-an-email' },
    { ...message, subject: '' },
    { ...message, text: 'x'.repeat(200_001) },
    { ...message, from: { ...message.from, address: 'attacker@example.com' } }
  ])('rejects an invalid or unapproved message %#', async (payload) => {
    const send = vi.fn()
    const worker = createTransactionalEmailWorker()

    const response = await worker.fetch(request(payload), {
      EMAIL: { send } as unknown as SendEmail
    })

    expect(response.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('returns only controlled provider failures', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(
      new Error('client@example.com provider detail'),
      { code: 'E_RATE_LIMIT_EXCEEDED' }
    ))
    const worker = createTransactionalEmailWorker()

    const response = await worker.fetch(request(message), {
      EMAIL: { send } as unknown as SendEmail
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      outcome: 'retryable',
      provider: 'cloudflare_email',
      providerMessageId: null,
      errorClass: 'cloudflare_email_e_rate_limit_exceeded'
    })
  })
})
