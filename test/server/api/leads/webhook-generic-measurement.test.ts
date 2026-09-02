import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).defineEventHandler = (fn: unknown) => fn
;(globalThis as any).createError = (opts: Record<string, unknown>) => Object.assign(new Error(String(opts.statusMessage)), opts)
;(globalThis as any).getRouterParam = (event: any, key: string) => event.context.params[key]
;(globalThis as any).readBody = async (event: any) => event.body
;(globalThis as any).getRequestHeaders = () => ({})
;(globalThis as any).getHeader = (event: any, key: string) => event.headers?.[key.toLowerCase()]
;(globalThis as any).setResponseHeader = () => {}
;(globalThis as any).setResponseHeaders = (event: any, headers: Record<string, string>) => {
  event.responseHeaders = { ...(event.responseHeaders || {}), ...headers }
}

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(async () => ({
    id: 'endpoint-1',
    client_id: '11111111-1111-4111-8111-111111111111',
    secret_key: 'secret',
    source: 'webhook',
    secret_key_previous: null,
    secret_key_grace_until: null,
    allowed_origins: ['https://www.southmorangmotorgroup.com.au']
  }))
}))

const { logIngestionError, upsertFormMetadata } = vi.hoisted(() => ({
  logIngestionError: vi.fn(),
  upsertFormMetadata: vi.fn()
}))
vi.mock('~~/server/utils/leads/db', () => ({
  upsertFormMetadata,
  logIngestionError,
  loadLead: vi.fn(async () => null)
}))

const { acceptLead } = vi.hoisted(() => ({
  acceptLead: vi.fn()
}))
vi.mock('~~/server/utils/leads/acceptance', () => ({
  acceptLead
}))

vi.mock('~~/server/utils/leads/autoAssign', () => ({
  resolveAssignedAm: vi.fn(async () => null)
}))
vi.mock('~~/server/utils/leads/rateLimit', () => ({
  allowRequest: vi.fn(() => ({ allowed: true }))
}))
const handler = (await import('../../../../server/api/leads/webhook/generic/[token].post')).default

describe('generic lead webhook measurement handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    acceptLead.mockResolvedValue({
      status: 'created',
      leadId: '22222222-2222-4222-8222-222222222222'
    })
  })

  afterEach(() => {
    delete process.env.CRM_LEAD_PROMOTION_ENABLED
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

    expect(acceptLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      consentDecision: 'granted',
      leadCaptureMode: 'capture_only',
      lead: expect.objectContaining({
        source_lead_id: 'big-garage:submission-1',
        attribution: { browserEventId: 'browser-event-1', gclid: 'gclid-1' }
      })
    }))
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

    expect(acceptLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lead: expect.objectContaining({ source: 'webhook' })
    }))
  })

  it('echoes CORS only for a configured website origin', async () => {
    const event = {
      context: { params: { token: 'token-1' } },
      headers: { origin: 'https://www.southmorangmotorgroup.com.au' },
      responseHeaders: {},
      body: {
        key: 'secret',
        fields: { email: 'pilot@example.com' }
      }
    }

    await handler(event as any)

    expect(event.responseHeaders).toMatchObject({
      'Access-Control-Allow-Origin': 'https://www.southmorangmotorgroup.com.au',
      'Vary': 'Origin'
    })
  })

  it('rejects a browser POST from an unconfigured origin before ingesting PII', async () => {
    await expect(handler({
      context: { params: { token: 'token-1' } },
      headers: { origin: 'https://attacker.example' },
      body: {
        key: 'secret',
        customer: { email: 'private@example.com' }
      }
    } as any)).rejects.toMatchObject({ statusCode: 403 })

    expect(acceptLead).not.toHaveBeenCalled()
  })

  it('normalizes canonical customer and vehicle data without putting credentials into lead fields', async () => {
    await handler({
      context: { params: { token: 'token-1' } },
      body: {
        key: 'secret',
        schema_version: 1,
        provider: 'dealer_studio',
        lead_id: 'dealer-studio:lead-123',
        form_id: 'vehicle-enquiry',
        customer: {
          full_name: 'Jane Citizen',
          email: 'jane@example.com',
          mobile: '0400 123 456'
        },
        vehicle: {
          stock_number: 'S20619',
          year: 2023,
          make: 'Toyota',
          model: 'RAV4'
        }
      }
    } as any)

    const receivedLead = acceptLead.mock.calls[0][1].lead
    expect(receivedLead.field_data).toMatchObject({
      first_name: 'Jane',
      last_name: 'Citizen',
      full_name: 'Jane Citizen',
      email: 'jane@example.com',
      phone_number: '0400 123 456',
      lead_provider: 'dealer_studio',
      vehicle_stock_number: 'S20619',
      vehicle_year: '2023',
      vehicle_make: 'Toyota',
      vehicle_model: 'RAV4'
    })
    expect(receivedLead.field_data).not.toHaveProperty('key')
    expect(upsertFormMetadata).toHaveBeenCalledWith(
      'webhook',
      'vehicle-enquiry',
      null,
      expect.objectContaining({
        full_name: '[redacted]',
        email: '[redacted]',
        phone_number: '[redacted]',
        vehicle_stock_number: 'S20619'
      })
    )
  })

  it('routes an authenticated Knox Dealer Studio form to one typed web conversion', async () => {
    await handler({
      context: { params: { token: 'token-1' } },
      body: {
        key: 'secret',
        provider: 'dealerstudio',
        lead_id: 'knox-real-lead-1',
        form_id: 'knox-finance-enquiry',
        form_name: 'Finance Enquiry',
        customer: { email: 'buyer@example.com' },
        is_test: false
      }
    } as any)

    expect(acceptLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      conversionEventName: 'web_conversion',
      enquiryType: 'finance',
      lead: expect.objectContaining({ is_test: false })
    }))
    expect(acceptLead.mock.calls[0][1]).not.toHaveProperty('trustedConnectorId')
  })

  it('marks an unclassified Dealer Studio form as an untyped web conversion instead of lead_created', async () => {
    await handler({
      context: { params: { token: 'token-1' } },
      body: {
        key: 'secret',
        provider: 'dealerstudio',
        lead_id: 'knox-trade-in-1',
        form_id: 'knox-trade-in',
        customer: { email: 'buyer@example.com' },
        is_test: false
      }
    } as any)

    expect(acceptLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      conversionEventName: 'web_conversion',
      enquiryType: null
    }))
  })

  it('does not allow a provider request flag to enable CRM promotion', async () => {
    await handler({
      context: { params: { token: 'token-1' } },
      body: {
        key: 'secret',
        provider: 'dealer_studio',
        customer: { full_name: 'Jane Citizen', email: 'jane@example.com' }
      }
    } as any)

    expect(acceptLead).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      leadCaptureMode: 'capture_only'
    }))

    acceptLead.mockClear()
    await handler({
      context: { params: { token: 'token-1' } },
      body: {
        key: 'secret',
        customer: { full_name: 'Jane Citizen', email: 'jane@example.com' },
        promote_to_crm: false
      }
    } as any)

    expect(acceptLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      leadCaptureMode: 'capture_only'
    }))
  })

  it('redacts credentials and customer identity from rejected-payload diagnostics', async () => {
    await handler({
      context: { params: { token: 'token-1' } },
      body: {
        key: 'super-secret-key',
        schema_version: 2,
        provider: 'dealer_studio',
        customer: {
          full_name: 'Private Person',
          email: 'private@example.com',
          mobile: '0400 999 999'
        }
      }
    } as any)

    expect(logIngestionError).toHaveBeenCalledOnce()
    const diagnostic = JSON.stringify(logIngestionError.mock.calls[0])
    expect(diagnostic).not.toContain('super-secret-key')
    expect(diagnostic).not.toContain('Private Person')
    expect(diagnostic).not.toContain('private@example.com')
    expect(diagnostic).not.toContain('0400 999 999')
    expect(diagnostic).toContain('dealer_studio')
  })

  it('rejects a valid envelope that contains provider metadata but no lead data', async () => {
    await handler({
      context: { params: { token: 'token-1' } },
      body: { key: 'secret', provider: 'dealer_studio' }
    } as any)

    expect(acceptLead).not.toHaveBeenCalled()
    expect(logIngestionError).toHaveBeenCalledWith(
      'webhook',
      expect.objectContaining({ provider: 'dealer_studio' }),
      expect.anything(),
      'empty_fields'
    )
  })
})
