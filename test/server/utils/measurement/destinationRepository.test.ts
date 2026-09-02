import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresMeasurementDestinationRepository
} from '../../../../server/utils/measurement/destinationRepository'
import type {
  CreateConversionDestinationConfiguration,
  UpdateConversionDestinationConfiguration
} from '../../../../server/utils/measurement/contracts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const CONNECTION_ID = '44444444-4444-4444-8444-444444444444'
const DESTINATION_ID = '55555555-5555-4555-8555-555555555555'
const CAPABILITY_ID = '66666666-6666-4666-8666-666666666666'
const MAPPING_ID = '77777777-7777-4777-8777-777777777777'
const CREATED_AT = new Date('2026-07-17T00:00:00.000Z')

function profileRow(version = 1) {
  return {
    id: PROFILE_ID,
    client_id: CLIENT_ID,
    desired_enabled: true,
    desired_state_source: 'existing_review',
    enabled: false,
    environment: 'test',
    collection_tier: 'backend_only',
    tracking_site_id: null,
    first_party_hostname: null,
    hostname_status: 'not_required',
    consent_mode: 'consent_gated',
    vertical: 'automotive',
    outcome_authority: 'zero_native',
    native_lifecycle_mode: 'crm_preferred',
    portal_outcome_mode: 'disabled',
    config_version: version,
    cache_status: 'not_published',
    cache_version: null,
    cache_error_class: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT
  }
}

function destinationRow(version = 2) {
  return {
    id: DESTINATION_ID,
    client_id: CLIENT_ID,
    profile_id: PROFILE_ID,
    platform: 'meta',
    social_connection_id: CONNECTION_ID,
    external_destination_id: '573284833843027',
    credential_configured: true,
    enabled: false,
    environment: 'test',
    health_status: 'configured',
    config_version: version,
    last_validated_at: null,
    last_success_at: null,
    last_failure_at: null,
    provider_request_id: null,
    error_class: null,
    redacted_error: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT
  }
}

function capabilityRow(version = 2) {
  return {
    id: CAPABILITY_ID,
    destination_id: DESTINATION_ID,
    platform: 'meta',
    mode: 'meta_crm_capi',
    status: 'configured',
    management_origin: 'zero',
    can_zero_mutate: true,
    evidence_at: null,
    blocking_reason: null,
    config_version: version,
    created_at: CREATED_AT,
    updated_at: CREATED_AT
  }
}

function mappingRow(version = 2) {
  return {
    id: MAPPING_ID,
    destination_id: DESTINATION_ID,
    canonical_event_name: 'lead_qualified',
    provider_event_name: 'QualifiedLead',
    is_active: true,
    config_version: version,
    created_at: CREATED_AT,
    updated_at: CREATED_AT
  }
}

function createInput(): CreateConversionDestinationConfiguration {
  return {
    clientId: CLIENT_ID,
    expectedProfileVersion: 1,
    reason: 'Configure Meta CRM delivery in test mode',
    actor: { type: 'team_member', id: ACTOR_ID },
    destination: {
      platform: 'meta',
      socialConnectionId: CONNECTION_ID,
      externalDestinationId: '573284833843027',
      credentialRef: 'cloudflare/measurement/meta/ferntree',
      capabilities: [{
        mode: 'meta_crm_capi',
        status: 'configured',
        managementOrigin: 'zero',
        canZeroMutate: true,
        blockingReason: null
      }],
      mappings: [{
        canonicalEventName: 'lead_qualified',
        providerEventName: 'QualifiedLead',
        isActive: true
      }]
    }
  }
}

function updateInput(): UpdateConversionDestinationConfiguration {
  return {
    clientId: CLIENT_ID,
    destinationId: DESTINATION_ID,
    expectedProfileVersion: 2,
    reason: 'Rotate the credential and retain the Qualified mapping in test mode',
    actor: { type: 'team_member', id: ACTOR_ID },
    patch: {
      credentialRef: 'cloudflare/measurement/meta/ferntree-v2',
      capabilities: [{
        mode: 'meta_crm_capi',
        status: 'configured',
        managementOrigin: 'zero',
        canZeroMutate: true,
        blockingReason: null
      }],
      mappings: [{
        canonicalEventName: 'lead_qualified',
        providerEventName: 'QualifiedLead',
        isActive: true
      }]
    }
  }
}

describe('Postgres measurement destination repository', () => {
  it('returns a paginated tenant-scoped read model without credential references', async () => {
    const queryOne = vi.fn(async () => ({ count: '1' }))
    const query = vi.fn()
      .mockResolvedValueOnce([destinationRow()])
      .mockResolvedValueOnce([capabilityRow()])
      .mockResolvedValueOnce([mappingRow()])
    const repository = createPostgresMeasurementDestinationRepository({
      queryOne: queryOne as never,
      query: query as never,
      transaction: vi.fn() as never
    })

    const result = await repository.list({
      clientId: CLIENT_ID,
      page: 1,
      pageSize: 25,
      platform: 'meta'
    })

    expect(result.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 1, totalPages: 1 })
    expect(result.items).toEqual([expect.objectContaining({
      clientId: CLIENT_ID,
      credentialConfigured: true,
      capabilities: [expect.objectContaining({ mode: 'meta_crm_capi' })],
      mappings: [expect.objectContaining({ canonicalEventName: 'lead_qualified' })]
    })])
    expect(JSON.stringify(result)).not.toContain('cloudflare/measurement/meta/ferntree')
    expect(queryOne).toHaveBeenCalledWith(expect.stringMatching(/WHERE client_id = \$1/), [
      CLIENT_ID,
      'meta'
    ])
    expect(query.mock.calls[0]?.[1]).toEqual([CLIENT_ID, 'meta', 25, 0])
  })

  it('creates a dormant destination and redacted audit in the profile-version transaction', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) return { rows: [profileRow(1)] }
        if (/FROM social_connections/.test(sql)) return { rows: [{ id: CONNECTION_ID }] }
        if (/UPDATE client_measurement_profiles/.test(sql)) return { rows: [profileRow(2)] }
        if (/INSERT INTO conversion_destinations/.test(sql)) return { rows: [destinationRow(2)] }
        if (/INSERT INTO conversion_destination_capabilities/.test(sql)) return { rows: [capabilityRow(2)] }
        if (/INSERT INTO conversion_event_mappings/.test(sql)) return { rows: [mappingRow(2)] }
        return { rows: [] }
      })
    }
    const transaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))
    const repository = createPostgresMeasurementDestinationRepository({
      queryOne: vi.fn() as never,
      query: vi.fn() as never,
      transaction: transaction as never
    })

    const result = await repository.create(createInput())

    expect(result).toMatchObject({
      status: 'created',
      profile: { configVersion: 2, cacheStatus: 'not_published' },
      destination: {
        configVersion: 2,
        enabled: false,
        environment: 'test',
        credentialConfigured: true
      }
    })
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/FOR UPDATE/),
      expect.stringMatching(/FROM social_connections/),
      expect.stringMatching(/UPDATE client_measurement_profiles/),
      expect.stringMatching(/INSERT INTO conversion_destinations/),
      expect.stringMatching(/INSERT INTO conversion_destination_capabilities/),
      expect.stringMatching(/INSERT INTO conversion_event_mappings/),
      expect.stringMatching(/INSERT INTO measurement_config_audit/)
    ])
    const destinationInsert = statements[3]!
    expect(statements[2]!.sql).toMatch(/live_approved_by = NULL/)
    expect(statements[2]!.sql).toMatch(/privacy_approved_by = NULL/)
    expect(destinationInsert.params).toContain(false)
    expect(destinationInsert.params).toContain('test')
    expect(destinationInsert.params).toContain(2)

    const audit = statements[6]!
    expect(audit.params).toContain('Configure Meta CRM delivery in test mode')
    expect(audit.params).toContain(2)
    const auditJson = audit.params.find(value => typeof value === 'string' && value.startsWith('{')) as string
    expect(JSON.parse(auditJson)).toMatchObject({
      credentialConfigured: true,
      configVersion: 2
    })
    expect(auditJson).not.toContain('cloudflare/measurement/meta/ferntree')
  })

  it('returns a version conflict before validating connections or writing', async () => {
    const db = { query: vi.fn(async () => ({ rows: [profileRow(3)] })) }
    const repository = createPostgresMeasurementDestinationRepository({
      queryOne: vi.fn() as never,
      query: vi.fn() as never,
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.create(createInput())).resolves.toEqual({
      status: 'version_conflict',
      currentVersion: 3
    })
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('hides a connection that is inactive, wrong-platform, or owned by another client', async () => {
    const db = {
      query: vi.fn(async (sql: string, _params: unknown[] = []) => {
        if (/FOR UPDATE/.test(sql)) return { rows: [profileRow(1)] }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementDestinationRepository({
      queryOne: vi.fn() as never,
      query: vi.fn() as never,
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.create(createInput())).resolves.toEqual({ status: 'connection_not_found' })
    expect(db.query).toHaveBeenCalledTimes(2)
    expect(db.query.mock.calls[1]?.[0]).toMatch(/client_id = \$2/)
    expect(db.query.mock.calls[1]?.[1]).toEqual([CONNECTION_ID, CLIENT_ID, 'meta'])
  })

  it('updates one tenant-scoped destination, replaces nested config, and audits only redacted state', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) return { rows: [profileRow(2)] }
        if (/conversion_destinations[\s\S]*FOR UPDATE/.test(sql)) return { rows: [destinationRow(2)] }
        if (/FROM conversion_destination_capabilities/.test(sql)) return { rows: [capabilityRow(2)] }
        if (/FROM conversion_event_mappings/.test(sql)) return { rows: [mappingRow(2)] }
        if (/FROM social_connections/.test(sql)) return { rows: [{ id: CONNECTION_ID }] }
        if (/UPDATE client_measurement_profiles/.test(sql)) return { rows: [profileRow(3)] }
        if (/UPDATE conversion_destinations/.test(sql)) return { rows: [destinationRow(3)] }
        if (/INSERT INTO conversion_destination_capabilities/.test(sql)) return { rows: [capabilityRow(3)] }
        if (/INSERT INTO conversion_event_mappings/.test(sql)) return { rows: [mappingRow(3)] }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementDestinationRepository({
      queryOne: vi.fn() as never,
      query: vi.fn() as never,
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    const result = await repository.update(updateInput())

    expect(result).toMatchObject({
      status: 'updated',
      profile: { configVersion: 3 },
      destination: {
        id: DESTINATION_ID,
        configVersion: 3,
        credentialConfigured: true,
        enabled: false,
        environment: 'test'
      }
    })
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/client_measurement_profiles[\s\S]*FOR UPDATE/),
      expect.stringMatching(/conversion_destinations[\s\S]*FOR UPDATE/),
      expect.stringMatching(/FROM conversion_destination_capabilities/),
      expect.stringMatching(/FROM conversion_event_mappings/),
      expect.stringMatching(/FROM social_connections/),
      expect.stringMatching(/UPDATE client_measurement_profiles/),
      expect.stringMatching(/UPDATE conversion_destinations/),
      expect.stringMatching(/DELETE FROM conversion_destination_capabilities/),
      expect.stringMatching(/INSERT INTO conversion_destination_capabilities/),
      expect.stringMatching(/DELETE FROM conversion_event_mappings/),
      expect.stringMatching(/INSERT INTO conversion_event_mappings/),
      expect.stringMatching(/INSERT INTO measurement_config_audit/)
    ])
    const audit = statements.at(-1)!
    const auditJson = audit.params.filter(value => (
      typeof value === 'string' && value.startsWith('{')
    )) as string[]
    expect(auditJson).toHaveLength(2)
    expect(auditJson.join(' ')).not.toContain('cloudflare/measurement/meta/ferntree-v2')
    expect(audit.params).toContain(3)
  })

  it('hides a destination owned by another client before any nested reads or writes', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) return { rows: [profileRow(2)] }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementDestinationRepository({
      queryOne: vi.fn() as never,
      query: vi.fn() as never,
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.update(updateInput())).resolves.toEqual({ status: 'not_found' })
    expect(db.query).toHaveBeenCalledTimes(2)
  })
})
