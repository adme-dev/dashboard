import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresMeasurementProfileRepository
} from '../../../../server/utils/measurement/profileRepository'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const TRACKING_SITE_ID = '55555555-5555-4555-8555-555555555555'

function row(version = 1) {
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
    created_at: new Date('2026-07-17T00:00:00.000Z'),
    updated_at: new Date(`2026-07-17T0${version - 1}:00:00.000Z`)
  }
}

describe('Postgres measurement profile repository', () => {
  it('maps only the requested client profile into the typed canonical shape', async () => {
    const queryOne = vi.fn(async () => row())
    const repository = createPostgresMeasurementProfileRepository({
      queryOne: queryOne as never,
      execute: vi.fn() as never,
      transaction: vi.fn() as never
    })

    const profile = await repository.getByClientId(CLIENT_ID)

    expect(profile).toMatchObject({
      id: PROFILE_ID,
      clientId: CLIENT_ID,
      desiredEnabled: true,
      desiredStateSource: 'existing_review',
      collectionTier: 'backend_only',
      configVersion: 1
    })
    expect(queryOne).toHaveBeenCalledWith(expect.stringMatching(/WHERE client_id = \$1/), [CLIENT_ID])
  })

  it('creates a desired-on, runtime-safe profile on demand for a client without one', async () => {
    const queryOne = vi.fn(async () => row())
    const execute = vi.fn(async () => 1)
    const repository = createPostgresMeasurementProfileRepository({
      queryOne: queryOne as never,
      execute: execute as never,
      transaction: vi.fn() as never
    })

    const profile = await repository.getByClientId(CLIENT_ID, { createIfMissing: true })

    expect(profile).toMatchObject({
      clientId: CLIENT_ID,
      desiredEnabled: true,
      desiredStateSource: 'existing_review',
      enabled: false,
      environment: 'test',
      vertical: 'automotive',
      configVersion: 1
    })
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /INSERT INTO client_measurement_profiles \([\s\S]*client_id, vertical, desired_enabled, desired_state_source[\s\S]*TRUE, 'new_client_default'[\s\S]*FROM agency_clients[\s\S]*ON CONFLICT \(client_id\) DO NOTHING/
      ),
      [CLIENT_ID]
    )
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/FROM client_measurement_profiles[\s\S]*WHERE client_id = \$1/),
      [CLIENT_ID]
    )
  })

  it('updates and appends before/after audit evidence inside one transaction', async () => {
    const queries: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        if (/FOR UPDATE/.test(sql)) return { rows: [row(1)] }
        if (/UPDATE client_measurement_profiles/.test(sql)) {
          return {
            rows: [{
              ...row(2),
              collection_tier: 'first_party_cname',
              tracking_site_id: TRACKING_SITE_ID,
              first_party_hostname: 'track.example.com',
              hostname_status: 'pending'
            }]
          }
        }
        return { rows: [] }
      })
    }
    const transaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))
    const repository = createPostgresMeasurementProfileRepository({
      queryOne: vi.fn() as never,
      execute: vi.fn() as never,
      transaction: transaction as never
    })

    const current = row(1)
    const result = await repository.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      nextProfile: {
        id: PROFILE_ID,
        clientId: CLIENT_ID,
        desiredEnabled: true,
        desiredStateSource: 'existing_review',
        enabled: false,
        environment: 'test',
        collectionTier: 'first_party_cname',
        trackingSiteId: TRACKING_SITE_ID,
        firstPartyHostname: 'track.example.com',
        hostnameStatus: 'pending',
        consentMode: 'consent_gated',
        vertical: 'automotive',
        outcomeAuthority: 'zero_native',
        nativeLifecycleMode: 'crm_preferred',
        portalOutcomeMode: 'disabled',
        configVersion: 2,
        cacheStatus: 'not_published',
        cacheVersion: null,
        cacheErrorClass: null,
        createdAt: current.created_at.toISOString(),
        updatedAt: current.updated_at.toISOString()
      },
      changedFields: ['collectionTier', 'trackingSiteId', 'firstPartyHostname', 'hostnameStatus'],
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      reason: 'Prepare first-party collection in test mode'
    })

    expect(result).toMatchObject({
      status: 'updated',
      profile: { configVersion: 2, firstPartyHostname: 'track.example.com' }
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(queries.map(query => query.sql)).toEqual([
      expect.stringMatching(/FOR UPDATE/),
      expect.stringMatching(/config_version = config_version \+ 1/),
      expect.stringMatching(/INSERT INTO measurement_config_audit/)
    ])
    expect(queries[1]!.sql).toMatch(/live_approved_by = NULL/)
    expect(queries[1]!.sql).toMatch(/privacy_approved_by = NULL/)

    const audit = queries[2]!
    expect(audit.params).toContain('Prepare first-party collection in test mode')
    expect(JSON.parse(audit.params[4] as string)).toMatchObject({ configVersion: 1 })
    expect(JSON.parse(audit.params[5] as string)).toMatchObject({ configVersion: 2 })
  })

  it('returns not found without attempting a write for an unknown tenant profile', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) }
    const repository = createPostgresMeasurementProfileRepository({
      queryOne: vi.fn() as never,
      execute: vi.fn() as never,
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      nextProfile: {} as never,
      changedFields: ['vertical'],
      actor: { type: 'system', id: 'test' },
      reason: 'test'
    })).resolves.toEqual({ status: 'not_found' })

    expect(db.query).toHaveBeenCalledOnce()
  })

  it('reports whether the exact canonical version accepted the cache-health update', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
    const repository = createPostgresMeasurementProfileRepository({
      queryOne: vi.fn() as never,
      execute: execute as never,
      transaction: vi.fn() as never
    })
    const input = {
      clientId: CLIENT_ID,
      profileId: PROFILE_ID,
      configVersion: 2,
      status: 'fresh' as const,
      errorClass: null
    }

    await expect(repository.recordCachePublication(input)).resolves.toBe(true)
    await expect(repository.recordCachePublication(input)).resolves.toBe(false)
    expect(execute).toHaveBeenCalledWith(expect.stringMatching(/AND config_version = \$3/), [
      CLIENT_ID,
      PROFILE_ID,
      2,
      'fresh',
      null
    ])
  })
})
