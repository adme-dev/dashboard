import { describe, expect, it, vi } from 'vitest'
import {
  createCrmEmailInboundIdempotencyKey,
  enqueueCrmInboundEmail,
  type CrmEmailInboundQueueJob
} from '~~/server/utils/crm/emailInboundQueue'

const ROUTE_HASH = 'a'.repeat(64)

const job: CrmEmailInboundQueueJob = {
  version: 1,
  type: 'crm.email.inbound',
  idempotencyKey: `crm-inbound:${'b'.repeat(64)}`,
  routeId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  conversationId: '33333333-3333-4333-8333-333333333333',
  routeKind: 'conversation_reply',
  provider: 'cloudflare_email',
  providerMessageId: '<provider-message@example.net>',
  rawMimeR2Key: 'crm-email/inbound/2026/07/30/message.eml',
  receivedAt: '2026-07-30T05:30:00.000Z'
}

describe('CRM inbound email Queue handoff', () => {
  it('derives a stable opaque idempotency key from route and provider identity', async () => {
    const first = await createCrmEmailInboundIdempotencyKey(
      ROUTE_HASH,
      '<provider-message@example.net>'
    )
    const repeated = await createCrmEmailInboundIdempotencyKey(
      ROUTE_HASH,
      '<provider-message@example.net>'
    )
    const different = await createCrmEmailInboundIdempotencyKey(
      ROUTE_HASH,
      '<different-message@example.net>'
    )

    expect(first).toMatch(/^crm-inbound:[a-f0-9]{64}$/)
    expect(repeated).toBe(first)
    expect(different).not.toBe(first)
    expect(first).not.toContain(ROUTE_HASH)
    expect(first).not.toContain('provider-message')
  })

  it('requires the dedicated inbound Queue binding', async () => {
    await expect(enqueueCrmInboundEmail({
      context: { cloudflare: { env: {} } }
    } as never, job)).rejects.toThrow(
      'CRM_EMAIL_INBOUND_QUEUE binding unavailable'
    )
  })

  it('sends the exact versioned job as JSON to the dedicated binding', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const event = {
      context: {
        cloudflare: {
          env: {
            CRM_EMAIL_INBOUND_QUEUE: { send },
            JOBS_QUEUE: {
              send: vi.fn().mockRejectedValue(new Error('must not be used'))
            }
          }
        }
      }
    }

    await enqueueCrmInboundEmail(event as never, job)

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(job, { contentType: 'json' })
  })
})
