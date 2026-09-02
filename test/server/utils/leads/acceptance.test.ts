import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ingest: vi.fn(),
  enqueueLeadJob: vi.fn(),
  notifyOnNewLead: vi.fn(),
  publishEvent: vi.fn(),
  markCrmPromotionQueued: vi.fn(),
  markCrmPromotionSkipped: vi.fn(),
  markCrmPromotionFailure: vi.fn(),
  reserveSubmissionIntentForLead: vi.fn(),
  releaseSubmissionIntentReservation: vi.fn(),
  loadLead: vi.fn(),
  authorizeCanonicalTest: vi.fn(),
  appendServerEvent: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
  queryRows: vi.fn().mockResolvedValue([{ feature_key: 'crm.core', status: 'active' }])
}))

vi.mock('~~/server/utils/leads/db', () => ({
  loadLead: mocks.loadLead
}))

vi.mock('~~/server/utils/leads/intake', () => ({
  leadIntakeService: { ingest: mocks.ingest }
}))

vi.mock('~~/server/utils/leads/queue', () => ({
  enqueueLeadJob: mocks.enqueueLeadJob
}))

vi.mock('~~/server/utils/leads/notifyOnNew', () => ({
  notifyOnNewLead: mocks.notifyOnNewLead
}))

vi.mock('~~/server/utils/measurement/publisher', () => ({
  conversionOutboxPublisher: { publishEvent: mocks.publishEvent }
}))

vi.mock('~~/server/utils/leads/crmPromotionState', () => ({
  markCrmPromotionQueued: mocks.markCrmPromotionQueued,
  markCrmPromotionSkipped: mocks.markCrmPromotionSkipped,
  markCrmPromotionFailure: mocks.markCrmPromotionFailure
}))

vi.mock('~~/server/utils/leads/submissionIntent', () => ({
  reserveSubmissionIntentForLead: mocks.reserveSubmissionIntentForLead,
  releaseSubmissionIntentReservation: mocks.releaseSubmissionIntentReservation
}))

vi.mock('~~/server/utils/leads/captureTestRepository', () => ({
  leadCaptureTestRepository: {
    authorizeCanonicalTest: mocks.authorizeCanonicalTest,
    appendServerEvent: mocks.appendServerEvent
  }
}))

const { acceptLead } = await import('../../../../server/utils/leads/acceptance')

function input(leadCaptureMode: 'analytics_only' | 'capture_only' | 'full_crm') {
  return {
    leadCaptureMode,
    consentDecision: 'granted' as const,
    lead: {
      client_id: '11111111-1111-4111-8111-111111111111',
      source: 'webhook' as const,
      source_lead_id: 'provider-lead-1',
      form_id: 'enquiry',
      form_name: 'Vehicle enquiry',
      ad_id: null,
      ad_name: null,
      campaign_id: null,
      campaign_name: null,
      page_id: null,
      submitted_at: '2026-08-21T00:00:00.000Z',
      field_data: { email: 'person@example.com' },
      attribution: { browserEventId: 'browser-event-1' },
      assigned_to: null,
      created_by: null,
      is_test: false
    }
  }
}

describe('canonical lead acceptance side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reserveSubmissionIntentForLead.mockResolvedValue(null)
    mocks.loadLead.mockResolvedValue({ id: 'lead-1' })
    mocks.ingest.mockResolvedValue({
      status: 'created',
      leadId: 'lead-1',
      outbox: {
        status: 'created',
        event: { eventId: 'event-1', outboxStatus: 'pending' }
      }
    })
  })

  it('runs each capture-only side effect once without CRM promotion', async () => {
    await expect(acceptLead({} as any, input('capture_only'))).resolves.toEqual({
      status: 'created',
      leadId: 'lead-1'
    })

    expect(mocks.ingest).toHaveBeenCalledTimes(1)
    expect(mocks.publishEvent).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueLeadJob).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueLeadJob).toHaveBeenCalledWith({
      type: 'rules.evaluate',
      payload: { lead_id: 'lead-1' }
    })
    expect(mocks.notifyOnNewLead).toHaveBeenCalledTimes(1)
    expect(mocks.markCrmPromotionQueued).not.toHaveBeenCalled()
  })

  it('adds exactly one CRM promotion job only in full CRM mode', async () => {
    await acceptLead({} as any, input('full_crm'))

    expect(mocks.enqueueLeadJob).toHaveBeenCalledTimes(2)
    expect(mocks.enqueueLeadJob).toHaveBeenNthCalledWith(2, {
      type: 'crm.promote',
      payload: { lead_id: 'lead-1' }
    })
    expect(mocks.markCrmPromotionQueued).toHaveBeenCalledTimes(1)
  })

  it('performs no ingestion or downstream action in analytics-only mode', async () => {
    await expect(acceptLead({} as any, input('analytics_only'))).resolves.toEqual({
      status: 'mode_skipped'
    })

    expect(mocks.ingest).not.toHaveBeenCalled()
    expect(mocks.publishEvent).not.toHaveBeenCalled()
    expect(mocks.enqueueLeadJob).not.toHaveBeenCalled()
    expect(mocks.notifyOnNewLead).not.toHaveBeenCalled()
    expect(mocks.markCrmPromotionQueued).not.toHaveBeenCalled()
  })

  it('does not repeat downstream actions for a duplicate provider receipt', async () => {
    mocks.ingest.mockResolvedValueOnce({ status: 'duplicate' })

    await expect(acceptLead({} as any, input('full_crm'))).resolves.toEqual({
      status: 'duplicate'
    })

    expect(mocks.publishEvent).not.toHaveBeenCalled()
    expect(mocks.enqueueLeadJob).not.toHaveBeenCalled()
    expect(mocks.notifyOnNewLead).not.toHaveBeenCalled()
    expect(mocks.markCrmPromotionQueued).not.toHaveBeenCalled()
  })

  it('stores a synthetic lead but suppresses every normal downstream side effect', async () => {
    const synthetic = input('full_crm')
    synthetic.lead.is_test = true

    await expect(acceptLead({} as any, synthetic)).resolves.toEqual({
      status: 'created',
      leadId: 'lead-1'
    })

    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({
      publishConversion: false,
      publishBrowserConfirmation: false,
      lead: expect.objectContaining({ is_test: true })
    }))
    expect(mocks.publishEvent).not.toHaveBeenCalled()
    expect(mocks.enqueueLeadJob).not.toHaveBeenCalled()
    expect(mocks.notifyOnNewLead).not.toHaveBeenCalled()
    expect(mocks.markCrmPromotionQueued).not.toHaveBeenCalled()
  })

  it('preserves a typed legacy website conversion without granting connector test authority', async () => {
    await acceptLead({} as any, {
      ...input('capture_only'),
      conversionEventName: 'web_conversion',
      enquiryType: 'finance'
    })

    expect(mocks.authorizeCanonicalTest).not.toHaveBeenCalled()
    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({
      conversionEventName: 'web_conversion',
      enquiryType: 'finance',
      publishConversion: true
    }))
  })
})
