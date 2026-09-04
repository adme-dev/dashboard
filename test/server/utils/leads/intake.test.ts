import { describe, expect, it, vi } from 'vitest'
import { createLeadIntakeService } from '../../../../server/utils/leads/intake'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LEAD_ID = '22222222-2222-4222-8222-222222222222'
const db = { query: vi.fn() }

function input() {
  return {
    lead: {
      client_id: CLIENT_ID,
      source: 'webhook' as const,
      source_lead_id: 'big-garage:submission-1',
      form_id: 'enquiry',
      form_name: 'Big Garage enquiry',
      ad_id: null,
      ad_name: null,
      campaign_id: null,
      campaign_name: null,
      page_id: null,
      submitted_at: '2026-07-18T05:30:00.000Z',
      field_data: { email: 'pilot@example.com' },
      attribution: {
        browserEventId: 'browser-event-1',
        gclid: 'gclid-1',
        fbc: 'fb.1.123.click',
        fbp: 'fb.1.123.browser',
        ttclid: 'tiktok-click-1',
        ttp: 'tiktok-browser-1',
        gaClientId: '123.456',
        eventSourceUrl: 'https://rebtyota.com.au/new-vehicles/?secret=drop#form',
        clientUserAgent: 'Werribee browser',
        utm_source: 'google',
        email: 'must-not-enter-conversion-outbox@example.com'
      },
      assigned_to: null,
      created_by: null,
      is_test: true
    },
    consentDecision: 'granted' as const
  }
}

describe('first-party lead intake', () => {
  it('inserts the lead and appends one PII-minimised lead_created event on the same transaction', async () => {
    const insertLead = vi.fn(async () => LEAD_ID)
    const appendOutbox = vi.fn(async () => ({
      status: 'created' as const,
      event: { eventId: '33333333-3333-4333-8333-333333333333', outboxStatus: 'paused' },
      deliveryCount: 0
    }))
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead,
      appendOutbox: appendOutbox as never,
      appendBrowserConfirmation: vi.fn(async () => true),
      completeIntentMatch: vi.fn()
    })

    const result = await service.ingest(input())

    expect(result).toMatchObject({ status: 'created', leadId: LEAD_ID })
    expect(insertLead).toHaveBeenCalledWith(input().lead, db)
    expect(appendOutbox).toHaveBeenCalledWith(db, {
      clientId: CLIENT_ID,
      eventName: 'lead_created',
      sourceSystem: 'zero_lead',
      sourceEntityType: 'lead',
      sourceEntityId: LEAD_ID,
      sourceEventId: 'browser:browser-event-1',
      occurredAt: '2026-07-18T05:30:00.000Z',
      consentDecision: 'granted',
      attribution: {
        browserEventId: 'browser-event-1',
        metaLeadId: null,
        gclid: 'gclid-1',
        gbraid: null,
        wbraid: null,
        fbc: 'fb.1.123.click',
        fbp: 'fb.1.123.browser',
        ttclid: 'tiktok-click-1',
        ttp: 'tiktok-browser-1',
        gaClientId: '123.456',
        eventSourceUrl: 'https://rebtyota.com.au/new-vehicles/',
        clientUserAgent: 'Werribee browser'
      }
    })
    expect(JSON.stringify(appendOutbox.mock.calls)).not.toContain('pilot@example.com')
    expect(JSON.stringify(appendOutbox.mock.calls)).not.toContain('must-not-enter')
  })

  it('does not append another canonical event when the source lead is a duplicate', async () => {
    const appendOutbox = vi.fn()
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => null),
      appendOutbox: appendOutbox as never,
      appendBrowserConfirmation: vi.fn(async () => false),
      completeIntentMatch: vi.fn()
    })

    await expect(service.ingest(input())).resolves.toEqual({ status: 'duplicate' })
    expect(appendOutbox).not.toHaveBeenCalled()
  })

  it('derives the CRM match key for a genuine Meta Lead Ads lead', async () => {
    const appendOutbox = vi.fn(async () => ({ status: 'profile_not_found' as const }))
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => LEAD_ID),
      appendOutbox: appendOutbox as never,
      appendBrowserConfirmation: vi.fn(async () => false),
      completeIntentMatch: vi.fn()
    })
    const metaInput = input()
    metaInput.lead.source = 'meta'
    metaInput.lead.source_lead_id = '1234567890123456'
    metaInput.lead.attribution = null

    await service.ingest(metaInput)

    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      attribution: expect.objectContaining({ metaLeadId: '1234567890123456' })
    }))
  })
})
