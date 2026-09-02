import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresMeasurementOutcomeEndpointRepository
} from '../../../../server/utils/measurement/outcomeEndpointRepository'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const ENDPOINT_ID = '44444444-4444-4444-8444-444444444444'
const ENDPOINT_KEY = 'a'.repeat(43)
const CREATED_AT = new Date('2026-07-17T07:00:00.000Z')

function profileRow(version = 4) {
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
    outcome_authority: 'client_webhook',
    native_lifecycle_mode: 'leads_only',
    portal_outcome_mode: 'disabled',
    config_version: version,
    cache_status: 'not_published',
    cache_version: null,
    cache_error_class: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT
  }
}

function endpointRow(version = 5) {
  return {
    id: ENDPOINT_ID,
    client_id: CLIENT_ID,
    profile_id: PROFILE_ID,
    endpoint_key: ENDPOINT_KEY,
    label: 'Dealer CRM',
    source_system: 'dealer_crm',
    secret_configured: true,
    secret_version: 1,
    status: 'disabled',
    replay_window_seconds: 300,
    rate_limit_per_minute: 60,
    config_version: version,
    last_received_at: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT
  }
}

function input() {
  return {
    clientId: CLIENT_ID,
    expectedProfileVersion: 4,
    actor: { type: 'team_member' as const, id: ACTOR_ID },
    reason: 'Prepare external CRM outcomes in test mode',
    endpointKey: ENDPOINT_KEY,
    endpoint: {
      label: 'Dealer CRM',
      sourceSystem: 'dealer_crm',
      currentSecretRef: 'cloudflare/measurement/outcomes/dealer-crm-v1',
      replayWindowSeconds: 300,
      rateLimitPerMinute: 60
    }
  }
}

describe('Postgres measurement outcome endpoint repository', () => {
  it('lists tenant-scoped endpoint policy without secret references', async () => {
    const queryOne = vi.fn(async () => ({ count: '1' }))
    const query = vi.fn(async () => [endpointRow()])
    const repository = createPostgresMeasurementOutcomeEndpointRepository({
      queryOne: queryOne as never,
      query: query as never,
      transaction: vi.fn() as never
    })

    const result = await repository.list({ clientId: CLIENT_ID, page: 1, pageSize: 25 })

    expect(result.items[0]).toMatchObject({
      endpointKey: ENDPOINT_KEY,
      secretConfigured: true,
      status: 'disabled'
    })
    expect(JSON.stringify(result)).not.toContain('cloudflare/measurement/outcomes')
    expect(queryOne).toHaveBeenCalledWith(expect.stringMatching(/WHERE client_id = \$1/), [CLIENT_ID])
  })

  it('creates a disabled endpoint and redacted audit in the profile-version transaction', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [profileRow(4)] }
        }
        if (/UPDATE client_measurement_profiles/.test(sql)) return { rows: [profileRow(5)] }
        if (/INSERT INTO outcome_endpoints/.test(sql)) return { rows: [endpointRow(5)] }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementOutcomeEndpointRepository({
      queryOne: vi.fn() as never,
      query: vi.fn() as never,
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    const result = await repository.create(input())

    expect(result).toMatchObject({
      status: 'created',
      profile: { configVersion: 5 },
      endpoint: { status: 'disabled', configVersion: 5, secretConfigured: true }
    })
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/FOR UPDATE/),
      expect.stringMatching(/UPDATE client_measurement_profiles/),
      expect.stringMatching(/INSERT INTO outcome_endpoints/),
      expect.stringMatching(/INSERT INTO measurement_config_audit/)
    ])
    expect(statements[1]!.sql).toMatch(/privacy_approved_by = NULL/)
    const auditJson = statements.at(-1)!.params.filter(value => (
      typeof value === 'string' && value.startsWith('{')
    )) as string[]
    expect(auditJson.join(' ')).not.toContain('cloudflare/measurement/outcomes/dealer-crm-v1')
  })

  it('returns a version conflict before generating endpoint state', async () => {
    const db = { query: vi.fn(async () => ({ rows: [profileRow(6)] })) }
    const repository = createPostgresMeasurementOutcomeEndpointRepository({
      queryOne: vi.fn() as never,
      query: vi.fn() as never,
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.create(input())).resolves.toEqual({
      status: 'version_conflict',
      currentVersion: 6
    })
    expect(db.query).toHaveBeenCalledOnce()
  })
})
