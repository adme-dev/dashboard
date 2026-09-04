import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresMeasurementHealthRepository
} from '../../../../server/utils/measurement/healthRepository'
import type {
  RecordDestinationValidationEvidence
} from '../../../../server/utils/measurement/contracts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const DESTINATION_ID = '55555555-5555-4555-8555-555555555555'
const CAPABILITY_ID = '66666666-6666-4666-8666-666666666666'

function input(): RecordDestinationValidationEvidence {
  return {
    clientId: CLIENT_ID,
    destinationId: DESTINATION_ID,
    expectedConfigVersion: 3,
    observedAt: '2026-07-17T05:30:00.000Z',
    actor: { type: 'system', id: 'measurement-meta-validator' },
    reason: 'Meta test-event validation completed',
    providerRequestId: 'request-redacted-123',
    errorClass: null,
    redactedError: null,
    capabilities: [{ mode: 'meta_crm_capi', status: 'ready', blockingReason: null }]
  }
}

describe('Postgres measurement health repository', () => {
  it('records current-version system evidence and a redacted validation audit atomically', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ id: PROFILE_ID, config_version: 3 }] }
        }
        if (/conversion_destinations[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ platform: 'meta', config_version: 3, health_status: 'configured' }] }
        }
        if (/conversion_destination_capabilities[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ id: CAPABILITY_ID, mode: 'meta_crm_capi', status: 'configured' }] }
        }
        if (/SELECT CASE/.test(sql)) return { rows: [{ health_status: 'ready' }] }
        if (/UPDATE conversion_destinations/.test(sql)) {
          return { rows: [{ health_status: 'ready', last_validated_at: input().observedAt }] }
        }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementHealthRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    const result = await repository.recordValidation(input())

    expect(result).toEqual({
      status: 'recorded',
      evidence: {
        clientId: CLIENT_ID,
        destinationId: DESTINATION_ID,
        configVersion: 3,
        healthStatus: 'ready',
        observedAt: input().observedAt,
        capabilities: [{ mode: 'meta_crm_capi', status: 'ready', blockingReason: null }]
      }
    })
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/client_measurement_profiles[\s\S]*FOR UPDATE/),
      expect.stringMatching(/conversion_destinations[\s\S]*FOR UPDATE/),
      expect.stringMatching(/conversion_destination_capabilities[\s\S]*FOR UPDATE/),
      expect.stringMatching(/UPDATE conversion_destination_capabilities/),
      expect.stringMatching(/SELECT CASE/),
      expect.stringMatching(/UPDATE conversion_destinations/),
      expect.stringMatching(/INSERT INTO measurement_config_audit/)
    ])
    const auditJson = statements.at(-1)!.params.filter(value => (
      typeof value === 'string' && value.startsWith('{')
    )) as string[]
    expect(auditJson.join(' ')).not.toContain('access_token')
    expect(auditJson.join(' ')).not.toContain('providerResponse')
    expect(auditJson.join(' ')).toContain('request-redacted-123')
  })

  it('rejects stale evidence before locking a destination or mutating health', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [{ id: PROFILE_ID, config_version: 4 }] }))
    }
    const repository = createPostgresMeasurementHealthRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.recordValidation(input())).resolves.toEqual({
      status: 'version_conflict',
      currentVersion: 4
    })
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('rejects evidence for a capability that is absent from the scoped destination', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/client_measurement_profiles/.test(sql)) {
          return { rows: [{ id: PROFILE_ID, config_version: 3 }] }
        }
        if (/conversion_destinations/.test(sql)) {
          return { rows: [{ platform: 'meta', config_version: 3, health_status: 'configured' }] }
        }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementHealthRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.recordValidation(input())).resolves.toEqual({
      status: 'invalid_capability'
    })
    expect(db.query).toHaveBeenCalledTimes(3)
  })

  it('accepts TikTok Events API evidence only for a TikTok destination', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ id: PROFILE_ID, config_version: 3 }] }
        }
        if (/conversion_destinations[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ platform: 'tiktok', config_version: 3, health_status: 'validating' }] }
        }
        if (/conversion_destination_capabilities[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ id: CAPABILITY_ID, mode: 'tiktok_events_api', status: 'validating' }] }
        }
        if (/SELECT CASE/.test(sql)) return { rows: [{ health_status: 'ready' }] }
        if (/UPDATE conversion_destinations/.test(sql)) {
          return { rows: [{ health_status: 'ready', last_validated_at: input().observedAt }] }
        }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementHealthRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never
    })

    await expect(repository.recordValidation({
      ...input(),
      actor: { type: 'system', id: 'measurement-tiktok-validator' },
      reason: 'TikTok Test Events validation completed',
      providerRequestId: 'tiktok-request-1',
      capabilities: [{ mode: 'tiktok_events_api', status: 'ready', blockingReason: null }]
    })).resolves.toMatchObject({
      status: 'recorded',
      evidence: {
        healthStatus: 'ready',
        capabilities: [{ mode: 'tiktok_events_api', status: 'ready', blockingReason: null }]
      }
    })
  })

  it('writes the supplied actor type to the audit row', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ id: PROFILE_ID, config_version: 3 }] }
        }
        if (/conversion_destinations[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ platform: 'meta', config_version: 3, health_status: 'configured' }] }
        }
        if (/conversion_destination_capabilities[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ id: CAPABILITY_ID, mode: 'meta_pixel', status: 'configured' }] }
        }
        if (/SELECT CASE/.test(sql)) return { rows: [{ health_status: 'ready' }] }
        if (/UPDATE conversion_destinations/.test(sql)) {
          return { rows: [{ health_status: 'ready', last_validated_at: input().observedAt }] }
        }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementHealthRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await repository.recordValidation({
      ...input(),
      actor: { type: 'user', id: 'user-1' },
      capabilities: [{ mode: 'meta_pixel', status: 'ready', blockingReason: null }]
    })

    const audit = statements.at(-1)!
    expect(audit.sql).toContain('measurement_config_audit')
    expect(audit.params).toContain('user')
  })
})
