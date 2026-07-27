import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresMeasurementHealthRepository
} from '../../../../server/utils/measurement/healthRepository'
import {
  RecordDestinationValidationEvidenceSchema
} from '../../../../server/utils/measurement/contracts'
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
          return { rows: [{ id: PROFILE_ID }] }
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
    expect(statements[0]!.sql).not.toContain('config_version')
    const auditJson = statements.at(-1)!.params.filter(value => (
      typeof value === 'string' && value.startsWith('{')
    )) as string[]
    expect(auditJson.join(' ')).not.toContain('access_token')
    expect(auditJson.join(' ')).not.toContain('providerResponse')
    expect(auditJson.join(' ')).toContain('request-redacted-123')
  })

  it('rejects evidence when the destination itself changed', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/client_measurement_profiles/.test(sql)) {
          return { rows: [{ id: PROFILE_ID }] }
        }
        return {
          rows: [{
            platform: 'meta',
            config_version: 4,
            health_status: 'configured'
          }]
        }
      })
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
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('rejects evidence for a capability that is absent from the scoped destination', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/client_measurement_profiles/.test(sql)) {
          return { rows: [{ id: PROFILE_ID }] }
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

  it('writes the supplied actor type to the audit row', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{ id: PROFILE_ID }] }
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
      actor: { type: 'team_member', id: 'actor-1' },
      capabilities: [{ mode: 'meta_pixel', status: 'ready', blockingReason: null }]
    })

    const audit = statements.at(-1)!
    expect(audit.sql).toContain('measurement_config_audit')
    // Positional, not membership: a membership check would still pass if
    // actor_type and actor_id were swapped, which is the silent wrong-column
    // failure this parameter insertion was most at risk of.
    expect(audit.params[7]).toBe('team_member')
    expect(audit.params[8]).toBe('actor-1')
  })

  it('rejects an actor type the audit CHECK constraint would refuse', () => {
    // measurement_config_audit.actor_type permits only
    // team_member | client_user | system | import. Anything else fails at the
    // database, which unit tests with a mocked db would not otherwise catch.
    const result = RecordDestinationValidationEvidenceSchema.safeParse({
      ...input(),
      actor: { type: 'user', id: 'actor-1' }
    })
    expect(result.success).toBe(false)
  })
})
