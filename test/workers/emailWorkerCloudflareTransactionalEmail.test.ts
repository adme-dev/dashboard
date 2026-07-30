import { describe, expect, it, vi } from 'vitest'
import {
  createCloudflareTransactionalEmailProvider
} from '../../workers/email-worker/src/cloudflareTransactionalEmail'
import type {
  PreparedCrmTransactionalEmail
} from '../../server/utils/crm/transactionalEmail'

function preparedEmail(
  overrides: Partial<PreparedCrmTransactionalEmail> = {}
): PreparedCrmTransactionalEmail {
  return {
    from: {
      address: 'sales@example.com',
      name: 'Sales'
    },
    to: [{
      address: 'customer@example.net',
      name: null
    }],
    cc: [{
      address: 'manager@example.net',
      name: 'Manager'
    }],
    bcc: [],
    replyTo: {
      address: 'reply+opaque@reply.example.com',
      name: null
    },
    subject: 'Re: Vehicle enquiry',
    text: 'Thanks for your enquiry.',
    html: '<p>Thanks for your enquiry.</p>',
    headers: {
      'In-Reply-To': '<incoming@example.net>',
      'References': '<root@example.net> <incoming@example.net>',
      'X-XeroFlow-Origin': 'crm-email-gateway'
    },
    attachments: [{
      disposition: 'inline',
      contentId: 'photo-1',
      filename: 'vehicle.jpg',
      contentType: 'image/jpeg',
      content: new ArrayBuffer(4)
    }],
    ...overrides
  }
}

function binding(send: ReturnType<typeof vi.fn>): SendEmail {
  return { send } as unknown as SendEmail
}

describe('Cloudflare transactional email adapter', () => {
  it('translates the canonical message into the official Worker builder', async () => {
    const content = new ArrayBuffer(4)
    const send = vi.fn().mockResolvedValue({
      messageId: '  provider-message-1  '
    })
    const provider = createCloudflareTransactionalEmailProvider(binding(send))
    const input = preparedEmail({
      attachments: [{
        disposition: 'inline',
        contentId: 'photo-1',
        filename: 'vehicle.jpg',
        contentType: 'image/jpeg',
        content
      }]
    })

    await expect(provider.send(input)).resolves.toEqual({
      outcome: 'accepted',
      provider: 'cloudflare_email',
      providerMessageId: 'provider-message-1',
      errorClass: null
    })

    expect(send).toHaveBeenCalledWith({
      from: {
        email: 'sales@example.com',
        name: 'Sales'
      },
      to: ['customer@example.net'],
      cc: [{
        email: 'manager@example.net',
        name: 'Manager'
      }],
      bcc: [],
      replyTo: 'reply+opaque@reply.example.com',
      subject: 'Re: Vehicle enquiry',
      text: 'Thanks for your enquiry.',
      html: '<p>Thanks for your enquiry.</p>',
      headers: {
        'In-Reply-To': '<incoming@example.net>',
        'References': '<root@example.net> <incoming@example.net>',
        'X-XeroFlow-Origin': 'crm-email-gateway'
      },
      attachments: [{
        disposition: 'inline',
        contentId: 'photo-1',
        filename: 'vehicle.jpg',
        type: 'image/jpeg',
        content
      }]
    })
  })

  it.each([
    'E_RATE_LIMIT_EXCEEDED',
    'E_DAILY_LIMIT_EXCEEDED',
    'E_DELIVERY_FAILED',
    'E_INTERNAL_SERVER_ERROR'
  ])('maps retryable provider code %s without leaking its message', async (code) => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error('customer@example.net sensitive failure'), {
        code
      })
    )
    const provider = createCloudflareTransactionalEmailProvider(binding(send))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await provider.send(preparedEmail())

    expect(result).toEqual({
      outcome: 'retryable',
      provider: 'cloudflare_email',
      providerMessageId: null,
      errorClass: `cloudflare_email_${code.toLowerCase()}`
    })
    expect(JSON.stringify(result)).not.toContain('customer@example.net')
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it.each([
    'E_VALIDATION_ERROR',
    'E_FIELD_MISSING',
    'E_TOO_MANY_RECIPIENTS',
    'E_SENDER_NOT_VERIFIED',
    'E_RECIPIENT_NOT_ALLOWED',
    'E_RECIPIENT_SUPPRESSED',
    'E_SENDER_DOMAIN_NOT_AVAILABLE',
    'E_CONTENT_TOO_LARGE',
    'E_HEADER_NOT_ALLOWED',
    'E_HEADER_USE_API_FIELD',
    'E_HEADER_VALUE_INVALID',
    'E_HEADER_VALUE_TOO_LONG',
    'E_HEADER_NAME_INVALID',
    'E_HEADERS_TOO_LARGE',
    'E_HEADERS_TOO_MANY'
  ])('maps permanent provider code %s', async (code) => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error('provider detail'), { code })
    )
    const provider = createCloudflareTransactionalEmailProvider(binding(send))

    await expect(provider.send(preparedEmail())).resolves.toEqual({
      outcome: 'permanent_failure',
      provider: 'cloudflare_email',
      providerMessageId: null,
      errorClass: `cloudflare_email_${code.toLowerCase()}`
    })
  })

  it('treats an unknown provider exception as retryable', async () => {
    const provider = createCloudflareTransactionalEmailProvider(binding(
      vi.fn().mockRejectedValue(new Error('unknown sensitive detail'))
    ))

    await expect(provider.send(preparedEmail())).resolves.toEqual({
      outcome: 'retryable',
      provider: 'cloudflare_email',
      providerMessageId: null,
      errorClass: 'cloudflare_email_unknown'
    })
  })

  it.each([
    {},
    { messageId: null },
    { messageId: '   ' },
    { messageId: 'm'.repeat(501) }
  ])('treats malformed success %# as retryable', async (response) => {
    const provider = createCloudflareTransactionalEmailProvider(binding(
      vi.fn().mockResolvedValue(response)
    ))

    await expect(provider.send(preparedEmail())).resolves.toEqual({
      outcome: 'retryable',
      provider: 'cloudflare_email',
      providerMessageId: null,
      errorClass: 'cloudflare_email_invalid_response'
    })
  })
})
