import { describe, expect, it } from 'vitest'
import {
  classifyLegacyDealerLeadConversion,
  normalizeDealerMeasurementEvent,
  DealerLeadWebhookBodySchema,
  normalizeDealerLeadWebhookBody
} from '../../../../server/utils/leads/dealerLeadAdapter'

describe('universal dealer lead adapter', () => {
  it('maps first-class customer, vehicle and provider fields into canonical lead data', () => {
    const body = DealerLeadWebhookBodySchema.parse({
      key: 'endpoint-secret',
      schema_version: 1,
      provider: 'dealer_studio',
      lead_id: 'ds-lead-123',
      form_id: 'vehicle-enquiry',
      form_name: 'Vehicle enquiry',
      customer: {
        full_name: '  Jane Citizen  ',
        email: ' JANE@example.com ',
        phone: ' 0400 123 456 '
      },
      vehicle: {
        stock_number: ' S20619 ',
        vin: 'JTMB1234567890123',
        year: 2023,
        make: 'Toyota',
        model: 'RAV4',
        condition: 'used',
        price: 44990,
        url: 'https://dealer.example/cars/rav4'
      },
      fields: { preferred_contact_time: 'Morning' },
      attribution: {
        utm_source: 'meta',
        browserEventId: 'browser-event-1'
      },
      consent_decision: 'granted',
      submitted_at: '2026-07-23T03:30:00.000Z'
    })

    expect(normalizeDealerLeadWebhookBody(body)).toEqual(expect.objectContaining({
      provider: 'dealer_studio',
      sourceLeadId: 'ds-lead-123',
      formId: 'vehicle-enquiry',
      consentDecision: 'granted',
      submittedAt: '2026-07-23T03:30:00.000Z',
      attribution: {
        utm_source: 'meta',
        browserEventId: 'browser-event-1'
      },
      fieldData: expect.objectContaining({
        first_name: 'Jane',
        last_name: 'Citizen',
        full_name: 'Jane Citizen',
        email: 'JANE@example.com',
        phone_number: '0400 123 456',
        preferred_contact_time: 'Morning',
        lead_provider: 'dealer_studio',
        vehicle_stock_number: 'S20619',
        vehicle_vin: 'JTMB1234567890123',
        vehicle_year: '2023',
        vehicle_make: 'Toyota',
        vehicle_model: 'RAV4',
        vehicle_condition: 'used',
        vehicle_price: '44990',
        vehicle_url: 'https://dealer.example/cars/rav4'
      })
    }))
  })

  it('keeps the existing fields-only webhook contract backwards compatible', () => {
    const body = DealerLeadWebhookBodySchema.parse({
      key: 'endpoint-secret',
      lead_id: 'legacy-1',
      fields: {
        full_name: 'Legacy Customer',
        email: 'legacy@example.com',
        phone_number: '+61400123456'
      }
    })

    const normalized = normalizeDealerLeadWebhookBody(body)

    expect(normalized.provider).toBe('generic')
    expect(normalized.fieldData).toMatchObject({
      full_name: 'Legacy Customer',
      email: 'legacy@example.com',
      phone_number: '+61400123456',
      lead_provider: 'generic'
    })
  })

  it('rejects unsafe provider names and customer data beyond contract limits', () => {
    expect(DealerLeadWebhookBodySchema.safeParse({
      key: 'endpoint-secret',
      provider: '../dealer-studio',
      customer: { full_name: 'Jane Citizen', email: 'jane@example.com' }
    }).success).toBe(false)

    expect(DealerLeadWebhookBodySchema.safeParse({
      key: 'endpoint-secret',
      customer: { full_name: 'x'.repeat(501), email: 'jane@example.com' }
    }).success).toBe(false)
  })
})

describe('dealer measurement event normalization', () => {
  it.each([
    ['stock_enquiry', { canonicalEventName: 'web_conversion', enquiryType: 'stock' }],
    ['model_variant_enquiry', { canonicalEventName: 'web_conversion', enquiryType: 'model_variant' }],
    ['finance_enquiry', { canonicalEventName: 'web_conversion', enquiryType: 'finance' }],
    ['test_drive_enquiry', { canonicalEventName: 'web_conversion', enquiryType: 'test_drive' }],
    ['contact_us', { canonicalEventName: 'web_conversion', enquiryType: 'contact' }],
    ['service_booking', { canonicalEventName: 'web_conversion', enquiryType: 'service_booking' }],
    ['phone_click', { canonicalEventName: 'phone_click', enquiryType: null }],
    ['directions_click', { canonicalEventName: 'directions_click', enquiryType: null }]
  ] as const)('maps %s to one exact XeroFlow identity', (dealerEvent, expected) => {
    expect(normalizeDealerMeasurementEvent(dealerEvent)).toEqual({
      status: 'mapped',
      dealerEvent,
      ...expected
    })
  })

  it('pauses an unknown event for configuration without returning fallback mappings', () => {
    expect(normalizeDealerMeasurementEvent('generic_form')).toEqual({
      status: 'configuration_required',
      dealerEvent: 'generic_form'
    })
  })
})

describe('legacy Dealer Studio conversion classification', () => {
  it.each([
    [{ provider: 'dealerstudio.test', formId: 'knox-finance-enquiry' }, 'finance'],
    [{ provider: 'dealer_studio', formName: 'Finance Enquiry' }, 'finance'],
    [{ provider: 'dealerstudio', formId: 'knox-contact-enquiry' }, 'contact'],
    [{ provider: 'dealerstudio', formId: 'knox-vehicle-enquiry' }, 'stock'],
    [{ provider: 'dealerstudio', formId: 'knox-test-drive' }, 'test_drive'],
    [{ provider: 'dealerstudio', fieldData: { enquiry_type: 'model_variant' } }, 'model_variant']
  ])('maps one exact Dealer Studio alias to %s', (input, enquiryType) => {
    expect(classifyLegacyDealerLeadConversion({
      provider: input.provider,
      formId: input.formId ?? null,
      formName: input.formName ?? null,
      fieldData: input.fieldData ?? {}
    })).toMatchObject({
      status: 'mapped',
      canonicalEventName: 'web_conversion',
      enquiryType
    })
  })

  it('keeps trade-in and conflicting or unknown Dealer Studio forms fail-closed', () => {
    expect(classifyLegacyDealerLeadConversion({
      provider: 'dealerstudio', formId: 'knox-trade-in', formName: 'Trade In', fieldData: {}
    })).toMatchObject({
      status: 'configuration_required', canonicalEventName: 'web_conversion', enquiryType: null
    })
    expect(classifyLegacyDealerLeadConversion({
      provider: 'dealerstudio', formId: 'knox-finance-enquiry', formName: 'Vehicle Enquiry', fieldData: {}
    })).toMatchObject({
      status: 'configuration_required', reason: 'conflicting_aliases', enquiryType: null
    })
    expect(classifyLegacyDealerLeadConversion({
      provider: 'generic', formId: 'knox-vehicle-enquiry', formName: null, fieldData: {}
    })).toEqual({ status: 'not_dealer_studio' })
  })

  it('does not guess from a malformed explicit enquiry type', () => {
    expect(classifyLegacyDealerLeadConversion({
      provider: 'dealerstudio',
      formId: 'knox-finance-enquiry',
      formName: 'Finance Enquiry',
      fieldData: { enquiry_type: 'trade_in' }
    })).toMatchObject({
      status: 'configuration_required', reason: 'invalid_explicit_enquiry_type', enquiryType: null
    })
  })
})
