import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).defineEventHandler = (fn: unknown) => fn
;(globalThis as any).createError = (opts: Record<string, unknown>) => Object.assign(new Error(String(opts.statusMessage)), opts)
;(globalThis as any).getRouterParam = (event: any, key: string) => event.context.params[key]
;(globalThis as any).readBody = async (event: any) => event.body
;(globalThis as any).getRequestHeaders = () => ({})
;(globalThis as any).setResponseHeader = () => {}

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(async () => ({
    id: 'endpoint-1',
    client_id: '11111111-1111-4111-8111-111111111111',
    secret_key: 'secret',
    source: 'webhook',
    secret_key_previous: null,
    secret_key_grace_until: null
  }))
}))

vi.mock('~~/server/utils/leads/db', () => ({
  upsertFormMetadata: vi.fn(),
  logIngestionError: vi.fn(),
  loadLead: vi.fn(async () => null)
}))

const { ingest, publishEvent } = vi.hoisted(() => ({
  ingest: vi.fn(),
  publishEvent: vi.fn()
}))
vi.mock('~~/server/utils/leads/intake', () => ({
  leadIntakeService: { ingest }
}))

vi.mock('~~/server/utils/leads/autoAssign', () => ({
  resolveAssignedAm: vi.fn(async () => null)
}))
vi.mock('~~/server/utils/leads/rateLimit', () => ({
  allowRequest: vi.fn(() => ({ allowed: true }))
}))
vi.mock('~~/server/utils/leads/queue', () => ({
  enqueueLeadJob: vi.fn()
}))
vi.mock('~~/server/utils/leads/notifyOnNew', () => ({
  notifyOnNewLead: vi.fn()
}))

vi.mock('~~/server/utils/measurement/publisher', () => ({
  conversionOutboxPublisher: { publishEvent }
}))

const handler = (await import('../../../../server/api/leads/webhook/generic/[token].post')).default

describe('generic lead webhook measurement handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ingest.mockResolvedValue({
      status: 'created',
      leadId: '22222222-2222-4222-8222-222222222222',
      outbox: {
        status: 'created',
        event: {
          eventId: '33333333-3333-4333-8333-333333333333',
          outboxStatus: 'pending'
        },
        deliveryCount: 1
      }
    })
  })

  it('passes shared browser identity and explicit consent into atomic intake, then publishes pending work', async () => {
    const result = await handler({
      context: { params: { token: 'token-1' } },
      body: {
        key: 'secret',
        lead_id: 'big-garage:submission-1',
        form_id: 'enquiry',
        source: 'webhook',
        fields: { email: 'pilot@example.com' },
        attribution: { browserEventId: 'browser-event-1', gclid: 'gclid-1' },
        consent_decision: 'granted',
        submitted_at: '2026-07-18T05:30:00.000Z'
      }
    } as any)

    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({
      consentDecision: 'granted',
      lead: expect.objectContaining({
        source_lead_id: 'big-garage:submission-1',
        attribution: { browserEventId: 'browser-event-1', gclid: 'gclid-1' }
      })
    }))
    expect(publishEvent).toHaveBeenCalledWith(
      expect.anything(),
      '33333333-3333-4333-8333-333333333333'
    )
    expect(result).toEqual({
      ok: true,
      lead_id: '22222222-2222-4222-8222-222222222222'
    })
  })

  it('does not allow a website credential to impersonate a provider lead source', async () => {
    await handler({
      context: { params: { token: 'token-1' } },
      body: {
        key: 'secret',
        lead_id: '123456789012345',
        source: 'meta',
        fields: { email: 'pilot@example.com' },
        consent_decision: 'granted'
      }
    } as any)

    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({
      lead: expect.objectContaining({ source: 'webhook' })
    }))
  })
})
