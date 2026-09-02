import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresMeasurementProviderTestRepository,
  expectedPlatform
} from '~~/server/utils/measurement/providerTestRepository'

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
  it('maps each provider test mode to the platform it belongs to', () => {
    expect(expectedPlatform('meta_test_events')).toBe('meta')
    expect(expectedPlatform('google_validate_only')).toBe('google_data_manager')
    expect(expectedPlatform('ga4_debug_validation')).toBe('ga4')
  })

  it('resolves Google credentials from an encrypted profile instead of legacy token columns', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '77777777-7777-4777-8777-777777777777' }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'connection-1',
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
        platform: 'google_data_manager',
        external_destination_id: '1234567890',
        credential_ref: null,
        provider_event_name: 'QualifiedLead',
        account_id: '3584435581',
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        google_credential_profile_id: 'profile-1',
        profile_access_token_encrypted: new Uint8Array([1]),
        profile_access_token_iv: new Uint8Array([2]),
        profile_refresh_token_encrypted: new Uint8Array([3]),
        profile_refresh_token_iv: new Uint8Array([4]),
        profile_token_expires_at: '2026-07-20T08:00:00.000Z',
        scopes: ['https://www.googleapis.com/auth/datamanager'],
        metadata: { google_login_customer_id: '111-222-3333' },
        allowed_origins: [],
        capability_modes: ['google_enhanced_conversions_for_leads']
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: '33333333-3333-4333-8333-333333333333',
        mode: 'google_validate_only',
        status: 'requested',
        provider_request_id: null,
        error_class: null,
        redacted_error: null,
        completed_at: null
      }] })
    const resolveCredential = vi.fn().mockResolvedValue('profile-refresh-token')
    const repository = createPostgresMeasurementProviderTestRepository(
      async callback => callback({ query }),
      resolveCredential
    )

    const result = await repository.reserve({
      ...input,
      mode: 'google_validate_only',
      clickIdentifier: { type: 'gclid', value: 'test-click-id' }
    } as never)

    expect(result).toMatchObject({
      status: 'reserved',
      context: {
        delivery: {
          operatingAccountId: '3584435581',
          loginAccountId: '1112223333'
        },
        credential: { refreshToken: 'profile-refresh-token' },
        configuredCapabilityModes: ['google_enhanced_conversions_for_leads']
      }
    })
    expect(resolveCredential).toHaveBeenCalledWith(expect.objectContaining({
      google_credential_profile_id: 'profile-1'
    }))
    const contextSql = query.mock.calls[2]![0] as string
    expect(contextSql).toContain('LEFT JOIN google_credential_profiles gcp')
    expect(contextSql).toContain('gcp.refresh_token_encrypted AS profile_refresh_token_encrypted')
    expect(contextSql).not.toContain('sc.access_token')
  })

  it('rejects Google validation when no configured server capability is covered', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '77777777-7777-4777-8777-777777777777' }] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
        platform: 'google_data_manager',
        external_destination_id: '1234567890',
        credential_ref: null,
        provider_event_name: 'QualifiedLead',
        account_id: '3584435581',
        scopes: ['https://www.googleapis.com/auth/datamanager'],
        metadata: {},
        allowed_origins: [],
        capability_modes: ['google_tag_enhanced_conversions']
      }] })
    const repository = createPostgresMeasurementProviderTestRepository(
      async callback => callback({ query })
    )

    await expect(repository.reserve({
      ...input,
      mode: 'google_validate_only',
      clickIdentifier: { type: 'gclid', value: 'test-click-id' }
    } as never)).resolves.toEqual({ status: 'capability_not_configured' })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('reserves a dormant tenant-owned destination without persisting transient identifiers', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '77777777-7777-4777-8777-777777777777' }] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
        platform: 'meta',
        external_destination_id: '573284833843027',
        credential_ref: 'MEASUREMENT_PROVIDER_META_BIG_GARAGE',
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
        credential: { credentialRef: 'MEASUREMENT_PROVIDER_META_BIG_GARAGE' }
      }
    })

    const contextSql = query.mock.calls[2]![0] as string
    expect(contextSql).toContain('sc.client_id = d.client_id')
    expect(contextSql).toContain('d.credential_ref')
    expect(contextSql).not.toContain('sc.access_token')
    expect(contextSql).toContain('d.client_id = $1')
    expect(contextSql).toContain('conversion_destination_capabilities')
    const insertSql = query.mock.calls[3]![0] as string
    const insertParams = query.mock.calls[3]![1] as unknown[]
    expect(insertSql).not.toContain('test_event_code')
    expect(insertParams).not.toContain('TEST123456')
    expect(insertParams).not.toContain('1234567890123456')
  })

  it('uses the destination version when the profile advanced independently', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: '77777777-7777-4777-8777-777777777777'
      }] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
        platform: 'meta',
        external_destination_id: '573284833843027',
        credential_ref: 'MEASUREMENT_PROVIDER_META_BIG_GARAGE',
        provider_event_name: 'QualifiedLead',
        account_id: '5717158431690024',
        refresh_token: null,
        google_credential_profile_id: null,
        profile_refresh_token_encrypted: null,
        profile_refresh_token_iv: null,
        scopes: [],
        metadata: {},
        allowed_origins: [],
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
    const repository = createPostgresMeasurementProviderTestRepository(
      async callback => callback({ query })
    )

    await expect(repository.reserve(input)).resolves.toMatchObject({
      status: 'reserved'
    })
    expect(String(query.mock.calls[1]![0])).toMatch(
      /FROM client_measurement_profiles[\s\S]*FOR UPDATE/
    )
    const contextSql = String(query.mock.calls[2]![0])
    expect(contextSql).toContain(
      'd.config_version AS destination_config_version'
    )
    expect(contextSql).not.toContain('p.config_version AS profile_config_version')
    expect((query.mock.calls[3]![1] as unknown[])[7]).toBe(3)
  })

  it('derives Meta Web delivery from a configured Zero-owned capability', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '77777777-7777-4777-8777-777777777777' }] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
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

    const insertParams = query.mock.calls[3]![1] as unknown[]
    expect(insertParams).not.toContain('browser-event-1')
    expect(insertParams).not.toContain('fb.1.1234567890123.click')
    expect(insertParams).not.toContain('https://www.biggaragesubaru.com.au/enquire')
  })

  it('rejects Meta Web traffic when the required Zero-owned capability is not configured', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '77777777-7777-4777-8777-777777777777' }] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
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

    expect(query).toHaveBeenCalledTimes(3)
  })

  it('rejects a client-selected CRM path when server-owned capabilities require Web delivery', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '77777777-7777-4777-8777-777777777777' }] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
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
      .mockResolvedValueOnce({ rows: [{ id: '77777777-7777-4777-8777-777777777777' }] })
      .mockResolvedValueOnce({ rows: [{
        profile_id: '77777777-7777-4777-8777-777777777777',
        profile_enabled: false,
        profile_environment: 'test',
        destination_enabled: false,
        destination_environment: 'test',
        destination_config_version: 3,
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
