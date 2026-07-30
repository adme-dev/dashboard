import { describe, expect, it } from 'vitest'
import {
  CrmEmailInboundProcessingRequestSchema
} from '../../../../server/utils/crm/emailInboundProcessingContracts'

const R2_PREFIX
  = 'crm-email/inbound/2026/07/30/11111111-1111-4111-8111-111111111111'

function request() {
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
      attachments: [{
        r2ObjectKey: `${R2_PREFIX}/attachments/01.bin`,
        filename: 'details.pdf',
        contentType: 'application/pdf',
        byteSize: 1024,
        sha256: 'c'.repeat(64),
        contentId: null
      }],
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

describe('CRM email inbound processing contract', () => {
  it('accepts the minimal versioned plain-text request', () => {
    expect(
      CrmEmailInboundProcessingRequestSchema.parse(request())
    ).toEqual(request())
  })

  it.each([
    [
      'unknown fields',
      { ...request(), rawMime: 'must-not-cross-boundary' }
    ],
    [
      'HTML content',
      {
        ...request(),
        email: { ...request().email, html: '<p>unsafe</p>' }
      }
    ],
    [
      'attachment bytes',
      {
        ...request(),
        job: {
          ...request().job,
          attachments: [{
            ...request().job.attachments[0],
            content: 'must-not-cross-boundary'
          }]
        }
      }
    ],
    [
      'a lead route with a conversation',
      {
        ...request(),
        job: {
          ...request().job,
          conversationId: '44444444-4444-4444-8444-444444444444'
        }
      }
    ],
    [
      'an attachment from another R2 prefix',
      {
        ...request(),
        job: {
          ...request().job,
          attachments: [{
            ...request().job.attachments[0],
            r2ObjectKey:
              'crm-email/inbound/2026/07/30/55555555-5555-4555-8555-555555555555/attachments/01.bin'
          }]
        }
      }
    ],
    [
      'retention beyond thirty days',
      {
        ...request(),
        job: {
          ...request().job,
          rawMimeExpiresAt: '2026-09-01T05:30:00.001Z'
        }
      }
    ]
  ])('rejects %s', (_label, input) => {
    expect(
      CrmEmailInboundProcessingRequestSchema.safeParse(input).success
    ).toBe(false)
  })
})
