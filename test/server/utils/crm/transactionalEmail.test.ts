import { describe, expect, it, vi } from 'vitest'
import {
  CRM_TRANSACTIONAL_EMAIL_OUTCOMES
} from '~~/server/utils/crm/transactionalEmail'
import type {
  CrmTransactionalEmailProvider,
  PreparedCrmTransactionalEmail
} from '~~/server/utils/crm/transactionalEmail'

function preparedEmail(): PreparedCrmTransactionalEmail {
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
      contentId: 'vehicle-photo',
      filename: 'vehicle.jpg',
      contentType: 'image/jpeg',
      content: new ArrayBuffer(4)
    }]
  }
}

describe('CRM transactional email contract', () => {
  it('keeps prepared content and provider outcomes provider-neutral', async () => {
    expect(CRM_TRANSACTIONAL_EMAIL_OUTCOMES).toEqual([
      'accepted',
      'retryable',
      'permanent_failure'
    ])
    const send = vi.fn().mockResolvedValue({
      outcome: 'accepted',
      provider: 'cloudflare_email',
      providerMessageId: 'provider-message-1',
      errorClass: null
    })
    const provider: CrmTransactionalEmailProvider = { send }
    const email = preparedEmail()

    await expect(provider.send(email)).resolves.toEqual({
      outcome: 'accepted',
      provider: 'cloudflare_email',
      providerMessageId: 'provider-message-1',
      errorClass: null
    })

    expect(send).toHaveBeenCalledWith(email)
    const serialized = JSON.stringify(email)
    expect(serialized).not.toContain('reply_to')
    expect(serialized).not.toContain('apiToken')
    expect(serialized).not.toContain('binding')
    expect(serialized).not.toContain('clientId')
    expect(serialized).not.toContain('tenantId')
    expect(serialized).not.toContain('queue')
    expect(email.attachments[0]).toMatchObject({
      disposition: 'inline',
      contentId: 'vehicle-photo'
    })
  })

  it('allows another provider without changing the canonical interface', async () => {
    const provider: CrmTransactionalEmailProvider = {
      send: vi.fn().mockResolvedValue({
        outcome: 'accepted',
        provider: 'tenant_smtp',
        providerMessageId: 'smtp-message-1',
        errorClass: null
      })
    }

    await expect(provider.send(preparedEmail())).resolves.toMatchObject({
      provider: 'tenant_smtp',
      outcome: 'accepted'
    })
  })
})
