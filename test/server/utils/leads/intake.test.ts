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
  it('keeps default intake adapters when only core database dependencies are overridden', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => LEAD_ID),
      appendOutbox: vi.fn(async () => ({
        status: 'profile_not_found' as const
      })) as never
    })
    const emailInput = {
      ...input(),
      lead: {
        ...input().lead,
        source: 'email' as const,
        attribution: null
      }
    }

    await expect(service.ingest(emailInput)).resolves.toMatchObject({
      status: 'created',
      leadId: LEAD_ID,
      browserConfirmationStored: false
    })

    warn.mockRestore()
  })

  it('reports the safe intake stage before an outbox failure', async () => {
    const stages: string[] = []
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => LEAD_ID),
      appendOutbox: vi.fn().mockRejectedValue(
        new Error('sensitive outbox detail')
      ) as never,
      appendBrowserConfirmation: vi.fn(async () => false),
      completeIntentMatch: vi.fn(),
      linkIdentity: vi.fn(),
      captureProductInterest: vi.fn(),
      recordPersonaEvidence: vi.fn(),
      onStage: stage => stages.push(stage)
    })

    await expect(service.ingest(input())).rejects.toThrow(
      'sensitive outbox detail'
    )

    expect(stages.at(-1)).toBe('append_outbox')
  })

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
      completeIntentMatch: vi.fn(),
      linkIdentity: vi.fn(),
      captureProductInterest: vi.fn(),
      recordPersonaEvidence: vi.fn()
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
        gaClientId: null
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
      retryBrowserConfirmation: vi.fn(async () => false),
      completeIntentMatch: vi.fn(),
      linkIdentity: vi.fn(),
      captureProductInterest: vi.fn(),
      recordPersonaEvidence: vi.fn()
    })

    await expect(service.ingest(input())).resolves.toEqual({ status: 'duplicate' })
    expect(appendOutbox).not.toHaveBeenCalled()
  })

  it('carries bounded email trace attribution into measurement without contact data', async () => {
    const appendOutbox = vi.fn(async () => ({ status: 'profile_not_found' as const }))
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => LEAD_ID),
      appendOutbox: appendOutbox as never,
      appendBrowserConfirmation: vi.fn(async () => false),
      completeIntentMatch: vi.fn(),
      linkIdentity: vi.fn(),
      captureProductInterest: vi.fn(),
      recordPersonaEvidence: vi.fn()
    })
    const emailInput = {
      ...input(),
      lead: {
        ...input().lead,
        source: 'email' as const,
        source_lead_id: 'email:22222222-2222-4222-8222-222222222222:hash',
        attribution: {
          utm_source: 'carsales',
          utm_medium: 'classifieds',
          provider: 'carsales',
          email_endpoint_id: '22222222-2222-4222-8222-222222222222',
          parser: 'provider',
          confidence_band: 'high',
          transport: 'email',
          email: 'must-not-enter-measurement@example.com'
        }
      }
    }

    await service.ingest(emailInput)

    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      attribution: expect.objectContaining({
        utm_source: 'carsales',
        utm_medium: 'classifieds',
        provider: 'carsales',
        email_endpoint_id: '22222222-2222-4222-8222-222222222222',
        parser: 'provider',
        confidence_band: 'high',
        transport: 'email'
      })
    }))
    expect(JSON.stringify(appendOutbox.mock.calls)).not.toContain('must-not-enter-measurement')
  })

  it('returns evidence expiry without outbox or enrichment when the guarded insert is fenced', async () => {
    const appendOutbox = vi.fn()
    const linkIdentity = vi.fn()
    const appendBrowserConfirmation = vi.fn(async () => false)
    const completeIntentMatch = vi.fn()
    const captureProductInterest = vi.fn()
    const recordPersonaEvidence = vi.fn()
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => ({ status: 'evidence_expired' as const })),
      appendOutbox: appendOutbox as never,
      appendBrowserConfirmation,
      completeIntentMatch,
      linkIdentity,
      captureProductInterest,
      recordPersonaEvidence
    })
    const guarded = {
      ...input(),
      emailEvidenceGuard: {
        ingestionId: '33333333-3333-4333-8333-333333333333',
        leaseToken: '44444444-4444-4444-8444-444444444444'
      }
    }

    await expect(service.ingest(guarded)).resolves.toEqual({ status: 'evidence_expired' })
    expect(appendOutbox).not.toHaveBeenCalled()
    expect(appendBrowserConfirmation).not.toHaveBeenCalled()
    expect(completeIntentMatch).not.toHaveBeenCalled()
    expect(linkIdentity).not.toHaveBeenCalled()
    expect(captureProductInterest).not.toHaveBeenCalled()
    expect(recordPersonaEvidence).not.toHaveBeenCalled()
  })

  it('retries browser confirmation when a provider retries an already accepted lead', async () => {
    const retryBrowserConfirmation = vi.fn(async () => true)
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => null),
      appendOutbox: vi.fn() as never,
      appendBrowserConfirmation: vi.fn(async () => false),
      retryBrowserConfirmation,
      completeIntentMatch: vi.fn(),
      linkIdentity: vi.fn(),
      captureProductInterest: vi.fn(),
      recordPersonaEvidence: vi.fn()
    })

    await expect(service.ingest(input())).resolves.toEqual({ status: 'duplicate' })
    expect(retryBrowserConfirmation).toHaveBeenCalledWith(db, {
      clientId: CLIENT_ID,
      browserEventId: 'browser-event-1'
    })
  })

  it('derives the CRM match key for a genuine Meta Lead Ads lead', async () => {
    const appendOutbox = vi.fn(async () => ({ status: 'profile_not_found' as const }))
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => LEAD_ID),
      appendOutbox: appendOutbox as never,
      appendBrowserConfirmation: vi.fn(async () => false),
      completeIntentMatch: vi.fn(),
      linkIdentity: vi.fn(),
      captureProductInterest: vi.fn(),
      recordPersonaEvidence: vi.fn()
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

  it('preserves an exact service-booking identity for trusted website conversions', async () => {
    const appendOutbox = vi.fn(async () => ({ status: 'profile_not_found' as const }))
    const service = createLeadIntakeService({
      transaction: async callback => callback(db),
      insertLead: vi.fn(async () => LEAD_ID),
      appendOutbox: appendOutbox as never,
      appendBrowserConfirmation: vi.fn(async () => false),
      completeIntentMatch: vi.fn(),
      linkIdentity: vi.fn(),
      captureProductInterest: vi.fn(),
      recordPersonaEvidence: vi.fn()
    })

    await service.ingest({
      ...input(),
      conversionEventName: 'web_conversion',
      enquiryType: 'service_booking'
    })

    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      eventName: 'web_conversion',
      enquiryType: 'service_booking'
    }))
  })
})
