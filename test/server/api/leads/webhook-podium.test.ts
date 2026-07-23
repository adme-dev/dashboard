import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).defineEventHandler = (fn: unknown) => fn
;(globalThis as any).createError = (opts: Record<string, unknown>) => Object.assign(new Error(String(opts.statusMessage)), opts)
;(globalThis as any).getRouterParam = (event: any, key: string) => event.context.params[key]
;(globalThis as any).readRawBody = async (event: any) => event.rawBody
;(globalThis as any).getRequestHeaders = (event: any) => event.headers ?? {}
;(globalThis as any).getHeader = (event: any, key: string) => event.headers?.[key.toLowerCase()]
;(globalThis as any).setResponseHeader = () => {}

const ENDPOINT = {
  id: 'endpoint-1',
  client_id: '11111111-1111-4111-8111-111111111111',
  secret_key: 'podium-secret',
  secret_key_previous: null,
  secret_key_grace_until: null
}

const { queryOne } = vi.hoisted(() => ({ queryOne: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne }))

const { logIngestionError, upsertFormMetadata, loadLead } = vi.hoisted(() => ({
  logIngestionError: vi.fn(),
  upsertFormMetadata: vi.fn(),
  loadLead: vi.fn(async () => null)
}))
vi.mock('~~/server/utils/leads/db', () => ({
  logIngestionError,
  upsertFormMetadata,
  loadLead
}))

const { enqueueLeadJob, ingest, publishEvent } = vi.hoisted(() => ({
  enqueueLeadJob: vi.fn(),
  ingest: vi.fn(),
  publishEvent: vi.fn()
}))
vi.mock('~~/server/utils/leads/intake', () => ({
  leadIntakeService: { ingest }
}))
vi.mock('~~/server/utils/leads/autoAssign', () => ({
  resolveAssignedAm: vi.fn(async () => 'team-member-1')
}))
vi.mock('~~/server/utils/leads/rateLimit', () => ({
  allowRequest: vi.fn(() => ({ allowed: true }))
}))
vi.mock('~~/server/utils/leads/queue', () => ({ enqueueLeadJob }))
vi.mock('~~/server/utils/leads/notifyOnNew', () => ({
  notifyOnNewLead: vi.fn()
}))
vi.mock('~~/server/utils/measurement/publisher', () => ({
  conversionOutboxPublisher: { publishEvent }
}))

const handler = (await import('../../../../server/api/leads/webhook/podium/[token].post')).default

function eventBody(eventType = 'message.received') {
  return {
    data: {
      uid: 'message-1',
      body: 'Can I book a test drive?',
      createdAt: '2026-07-23T10:00:00.000Z',
      webchatUrl: 'https://www.southmorangmotorgroup.com.au/vehicles/rav4?utm_source=meta&utm_campaign=winter-rav4',
      contact: { uid: 'contact-1', name: 'Jane Citizen' },
      conversation: {
        uid: 'conversation-1',
        channel: { type: 'phone', identifier: '0400 123 456' }
      },
      location: { uid: 'location-1', organizationUid: 'org-1' }
    },
    metadata: {
      eventType,
      eventUid: 'event-1',
      version: '2021.04.01'
    }
  }
}

function signedEvent(body = eventBody()) {
  const rawBody = JSON.stringify(body)
  const timestamp = String(Date.now())
  const signature = createHmac('sha256', ENDPOINT.secret_key)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
  return {
    context: { params: { token: 'podium-token' } },
    headers: {
      'podium-timestamp': timestamp,
      'podium-signature': signature,
      'content-type': 'application/json'
    },
    rawBody
  }
}

describe('Podium lead webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryOne.mockReset()
    queryOne
      .mockResolvedValueOnce(ENDPOINT)
      .mockResolvedValueOnce({ id: 'tracking-site-1' })
    ingest.mockResolvedValue({
      status: 'created',
      leadId: '22222222-2222-4222-8222-222222222222',
      outbox: {
        status: 'created',
        event: {
          eventId: '33333333-3333-4333-8333-333333333333',
          outboxStatus: 'pending'
        }
      }
    })
  })

  afterEach(() => {
    delete process.env.CRM_LEAD_PROMOTION_ENABLED
  })

  it('ingests a signed webchat message through the universal lead boundary', async () => {
    const result = await handler(signedEvent() as any)

    expect(ingest).toHaveBeenCalledWith({
      lead: expect.objectContaining({
        client_id: ENDPOINT.client_id,
        source: 'webhook',
        source_lead_id: 'podium:event-1',
        form_id: 'podium-webchat',
        form_name: 'Podium Webchat',
        field_data: expect.objectContaining({
          full_name: 'Jane Citizen',
          phone_number: '0400 123 456',
          lead_provider: 'podium'
        }),
        attribution: {
          utm_source: 'meta',
          utm_campaign: 'winter-rav4'
        },
        assigned_to: 'team-member-1'
      }),
      consentDecision: 'unknown'
    })
    expect(enqueueLeadJob).toHaveBeenCalledWith({
      type: 'rules.evaluate',
      payload: { lead_id: '22222222-2222-4222-8222-222222222222' }
    })
    expect(result).toEqual({
      ok: true,
      lead_id: '22222222-2222-4222-8222-222222222222'
    })
    expect(queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/organizationUid[\s\S]*locationUids/),
      [ENDPOINT.client_id, 'https://www.southmorangmotorgroup.com.au', 'org-1', 'location-1']
    )
  })

  it('queues CRM promotion for confirmed webchat leads when rollout is enabled', async () => {
    process.env.CRM_LEAD_PROMOTION_ENABLED = 'true'

    await handler(signedEvent() as any)

    expect(enqueueLeadJob).toHaveBeenNthCalledWith(2, {
      type: 'crm.promote',
      payload: { lead_id: '22222222-2222-4222-8222-222222222222' }
    })
  })

  it('does not ingest Podium leads when the matching site has not enabled them', async () => {
    queryOne.mockReset()
    queryOne.mockResolvedValueOnce(ENDPOINT).mockResolvedValueOnce(null)

    await expect(handler(signedEvent() as any)).resolves.toEqual({
      ok: true,
      skipped: true,
      reason: 'provider_disabled'
    })
    expect(ingest).not.toHaveBeenCalled()
  })

  it('does not ingest a signed event from an organization or location outside the site allowlist', async () => {
    queryOne.mockReset()
    queryOne.mockResolvedValueOnce(ENDPOINT).mockResolvedValueOnce(null)

    const result = await handler(signedEvent(eventBody()) as any)

    expect(result).toEqual({ ok: true, skipped: true, reason: 'provider_disabled' })
    expect(queryOne).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      [ENDPOINT.client_id, 'https://www.southmorangmotorgroup.com.au', 'org-1', 'location-1']
    )
    expect(ingest).not.toHaveBeenCalled()
  })

  it('rejects an invalid signature before parsing or storing customer data', async () => {
    const event = signedEvent()
    event.headers['podium-signature'] = 'invalid'

    await expect(handler(event as any)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'invalid_signature'
    })
    expect(ingest).not.toHaveBeenCalled()
    expect(logIngestionError).not.toHaveBeenCalled()
  })

  it('rejects an oversized request before reading or verifying its contents', async () => {
    const event = signedEvent()
    event.headers['content-length'] = String(65 * 1024)

    await expect(handler(event as any)).rejects.toMatchObject({
      statusCode: 413,
      statusMessage: 'payload_too_large'
    })
    expect(ingest).not.toHaveBeenCalled()
  })

  it('acknowledges irrelevant Podium events without creating leads', async () => {
    const result = await handler(signedEvent(eventBody('message.sent')) as any)

    expect(result).toEqual({ ok: true, skipped: true, reason: 'event_type' })
    expect(ingest).not.toHaveBeenCalled()
  })

  it('acknowledges duplicate Podium event UIDs idempotently', async () => {
    ingest.mockResolvedValueOnce({ status: 'duplicate' })

    await expect(handler(signedEvent() as any)).resolves.toEqual({
      ok: true,
      skipped: true,
      reason: 'duplicate'
    })
    expect(enqueueLeadJob).not.toHaveBeenCalled()
  })
})
