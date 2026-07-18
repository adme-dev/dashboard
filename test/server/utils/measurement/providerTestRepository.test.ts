import { describe, expect, it, vi } from 'vitest'
import { createPostgresMeasurementProviderTestRepository } from '~~/server/utils/measurement/providerTestRepository'

const input = {
  clientId: '11111111-1111-4111-8111-111111111111',
  destinationId: '22222222-2222-4222-8222-222222222222',
  expectedConfigVersion: 3,
  canonicalEventName: 'lead_qualified' as const,
  occurredAt: '2026-07-17T08:00:00.000Z',
  idempotencyKey: '55555555-5555-4555-8555-555555555555',
  reason: 'Approved pilot validation',
  confirmed: true as const,
  actor: { id: '44444444-4444-4444-8444-444444444444' },
  mode: 'meta_test_events' as const,
  deliveryMode: 'crm' as const,
  testEventCode: 'TEST123456',
  metaLeadId: '1234567890123456',
  browserEventId: null
}

describe('measurement provider test repository', () => {
  it('reserves a dormant tenant-owned destination without persisting transient identifiers', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        profile_config_version: 3,
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
        platform: 'meta',
        external_destination_id: '573284833843027',
        provider_event_name: 'QualifiedLead',
        account_id: '5717158431690024',
        access_token: 'meta-token',
        refresh_token: null,
        scopes: [],
        metadata: {},
        allowed_origins: ['https://www.biggaragesubaru.com.au'],
        capability_modes: ['meta_crm_capi']
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: '33333333-3333-4333-8333-333333333333',
        mode: 'meta_test_events',
        status: 'requested',
        provider_request_id: null,
        error_class: null,
        redacted_error: null,
        completed_at: null
      }] })
    const repository = createPostgresMeasurementProviderTestRepository(async callback => callback({ query }))

    await expect(repository.reserve(input)).resolves.toMatchObject({
      status: 'reserved',
      context: {
        delivery: { externalDestinationId: '573284833843027' },
        credential: { accessToken: 'meta-token' }
      }
    })

    const contextSql = query.mock.calls[1]![0] as string
    expect(contextSql).toContain('sc.client_id = d.client_id')
    expect(contextSql).toContain('d.client_id = $1')
    expect(contextSql).toContain('conversion_destination_capabilities')
    const insertSql = query.mock.calls[2]![0] as string
    const insertParams = query.mock.calls[2]![1] as unknown[]
    expect(insertSql).not.toContain('test_event_code')
    expect(insertParams).not.toContain('TEST123456')
    expect(insertParams).not.toContain('1234567890123456')
  })

  it('derives Meta Web delivery from a configured Zero-owned capability', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        profile_config_version: 3,
        destination_enabled: false,
        destination_environment: 'test',
        platform: 'meta',
        external_destination_id: '573284833843027',
        provider_event_name: 'Lead',
        account_id: '5717158431690024',
        access_token: 'meta-token',
        refresh_token: null,
        scopes: [],
        metadata: {},
        allowed_origins: ['https://www.biggaragesubaru.com.au'],
        capability_modes: ['meta_web_capi']
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: '33333333-3333-4333-8333-333333333333',
        mode: 'meta_test_events',
        status: 'requested',
        provider_request_id: null,
        error_class: null,
        redacted_error: null,
        completed_at: null
      }] })
    const repository = createPostgresMeasurementProviderTestRepository(async callback => callback({ query }))

    await expect(repository.reserve({
      ...input,
      canonicalEventName: 'lead_created',
      deliveryMode: 'web',
      metaLeadId: undefined,
      browserEventId: 'browser-event-1',
      fbc: 'fb.1.1234567890123.click',
      fbp: null,
      eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
      clientUserAgent: 'Approved Pilot Browser'
    } as never)).resolves.toMatchObject({
      status: 'reserved',
      context: { delivery: { metaDeliveryMode: 'web' } }
    })

    const insertParams = query.mock.calls[2]![1] as unknown[]
    expect(insertParams).not.toContain('browser-event-1')
    expect(insertParams).not.toContain('fb.1.1234567890123.click')
    expect(insertParams).not.toContain('https://www.biggaragesubaru.com.au/enquire')
  })

  it('rejects Meta Web traffic when the required Zero-owned capability is not configured', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        profile_config_version: 3,
        destination_enabled: false,
        destination_environment: 'test',
        platform: 'meta',
        external_destination_id: '573284833843027',
        provider_event_name: 'Lead',
        account_id: '5717158431690024',
        access_token: 'meta-token',
        refresh_token: null,
        scopes: [],
        metadata: {},
        allowed_origins: ['https://www.biggaragesubaru.com.au'],
        capability_modes: []
      }] })
    const repository = createPostgresMeasurementProviderTestRepository(async callback => callback({ query }))

    await expect(repository.reserve({
      ...input,
      canonicalEventName: 'lead_created',
      deliveryMode: 'web',
      metaLeadId: undefined,
      browserEventId: 'browser-event-1',
      fbc: 'fb.1.1234567890123.click',
      fbp: null,
      eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
      clientUserAgent: 'Approved Pilot Browser'
    } as never)).resolves.toEqual({ status: 'capability_not_configured' })

    expect(query).toHaveBeenCalledTimes(2)
  })

  it('rejects a client-selected CRM path when server-owned capabilities require Web delivery', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        profile_config_version: 3,
        destination_enabled: false,
        destination_environment: 'test',
        platform: 'meta',
        external_destination_id: '573284833843027',
        provider_event_name: 'Lead',
        account_id: '5717158431690024',
        access_token: 'meta-token',
        refresh_token: null,
        scopes: [],
        metadata: {},
        allowed_origins: ['https://www.biggaragesubaru.com.au'],
        capability_modes: ['meta_crm_capi', 'meta_web_capi']
      }] })
    const repository = createPostgresMeasurementProviderTestRepository(async callback => callback({ query }))

    await expect(repository.reserve({
      ...input,
      canonicalEventName: 'lead_created'
    })).resolves.toEqual({ status: 'delivery_mode_mismatch' })
  })

  it('rejects a Web event source outside the tracking-site allowlist', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        profile_config_version: 3,
        destination_enabled: false,
        destination_environment: 'test',
        platform: 'meta',
        external_destination_id: '573284833843027',
        provider_event_name: 'Lead',
        account_id: '5717158431690024',
        access_token: 'meta-token',
        refresh_token: null,
        scopes: [],
        metadata: {},
        allowed_origins: ['https://www.biggaragesubaru.com.au'],
        capability_modes: ['meta_web_capi']
      }] })
    const repository = createPostgresMeasurementProviderTestRepository(async callback => callback({ query }))

    await expect(repository.reserve({
      ...input,
      canonicalEventName: 'lead_created',
      deliveryMode: 'web',
      metaLeadId: undefined,
      browserEventId: 'browser-event-1',
      fbc: 'fb.1.1234567890123.click',
      fbp: null,
      eventSourceUrl: 'https://unapproved.example/enquire',
      clientUserAgent: 'Approved Pilot Browser'
    } as never)).resolves.toEqual({ status: 'source_origin_not_approved' })
  })

  it('completes only the matching requested run', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }))
    const repository = createPostgresMeasurementProviderTestRepository(async callback => callback({ query }))

    await repository.complete({
      clientId: input.clientId,
      runId: '33333333-3333-4333-8333-333333333333',
      status: 'accepted',
      providerRequestId: 'trace-1',
      errorClass: null,
      redactedError: null,
      completedAt: '2026-07-17T08:00:01.000Z'
    })

    expect(query.mock.calls[0]![0]).toContain('AND status = \'requested\'')
  })
})
