import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresMeasurementActivationRepository
} from '../../../../server/utils/measurement/activationRepository'
import type {
  ActivateMeasurementProfile,
  ApproveMeasurementActivation
} from '../../../../server/utils/measurement/contracts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const PRIVACY_APPROVER_ID = '33333333-3333-4333-8333-333333333333'
const LIVE_APPROVER_ID = '44444444-4444-4444-8444-444444444444'
const CREATED_AT = new Date('2026-07-17T06:00:00.000Z')

function profileRow(version = 3, enabled = false, environment = 'test') {
  return {
    id: PROFILE_ID,
    client_id: CLIENT_ID,
    desired_enabled: true,
    desired_state_source: 'operator',
    enabled,
    environment,
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
    cache_status: version === 3 ? 'fresh' : 'not_published',
    cache_version: version === 3 ? 3 : null,
    cache_error_class: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT
  }
}

function approvalInput(): ApproveMeasurementActivation {
  return {
    clientId: CLIENT_ID,
    expectedConfigVersion: 3,
    approvalKind: 'privacy',
    actor: { type: 'team_member', id: PRIVACY_APPROVER_ID },
    reason: 'Consent and data-processing configuration reviewed'
  }
}

function activationInput(): ActivateMeasurementProfile {
  return {
    clientId: CLIENT_ID,
    expectedConfigVersion: 3,
    actor: { type: 'team_member', id: LIVE_APPROVER_ID },
    reason: 'All readiness and approval gates passed'
  }
}

describe('Postgres measurement activation repository', () => {
  it('records a version-bound approval and redacted audit without changing config version', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [profileRow()] }
        }
        if (/FROM measurement_activation_approvals/.test(sql)) return { rows: [] }
        if (/INSERT INTO measurement_activation_approvals/.test(sql)) {
          return { rows: [{
            id: '55555555-5555-4555-8555-555555555555',
            client_id: CLIENT_ID,
            profile_id: PROFILE_ID,
            config_version: 3,
            approval_kind: 'privacy',
            approved_by: PRIVACY_APPROVER_ID,
            reason: approvalInput().reason,
            created_at: CREATED_AT
          }] }
        }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    const result = await repository.approve(approvalInput())

    expect(result).toMatchObject({
      status: 'approved',
      approval: { approvalKind: 'privacy', configVersion: 3 }
    })
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/FOR UPDATE/),
      expect.stringMatching(/FROM measurement_activation_approvals/),
      expect.stringMatching(/INSERT INTO measurement_activation_approvals/),
      expect.stringMatching(/INSERT INTO measurement_config_audit/)
    ])
    expect(statements.at(-1)!.params.join(' ')).not.toContain('credential')
  })

  it('does not accept approvals while the client is explicitly opted out', async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [{
          ...profileRow(),
          desired_enabled: false,
          desired_state_source: 'explicit_opt_out'
        }]
      }))
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.approve(approvalInput())).resolves.toEqual({ status: 'not_available' })
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('returns a typed desired-disabled blocker before reading approvals or readiness', async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [{
          ...profileRow(),
          desired_enabled: false,
          desired_state_source: 'explicit_opt_out'
        }]
      }))
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.activate(activationInput())).resolves.toEqual({
      status: 'not_ready',
      blockers: ['desired_disabled']
    })
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('rejects the same team member approving both gates before inserting', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/client_measurement_profiles/.test(sql)) return { rows: [profileRow()] }
        return { rows: [{ approval_kind: 'live', approved_by: PRIVACY_APPROVER_ID }] }
      })
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.approve(approvalInput())).resolves.toEqual({
      status: 'approver_conflict'
    })
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('records an explicit owner separation override for the live gate', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles/.test(sql)) return { rows: [profileRow()] }
        if (/FROM measurement_activation_approvals/.test(sql)) {
          return { rows: [{ approval_kind: 'privacy', approved_by: PRIVACY_APPROVER_ID }] }
        }
        if (/INSERT INTO measurement_activation_approvals/.test(sql)) {
          return { rows: [{
            id: '66666666-6666-4666-8666-666666666666',
            client_id: CLIENT_ID,
            profile_id: PROFILE_ID,
            config_version: 3,
            approval_kind: 'live',
            approved_by: PRIVACY_APPROVER_ID,
            reason: 'Application owner authorizes a break-glass single-owner launch',
            separation_override: true,
            created_at: CREATED_AT
          }] }
        }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    const result = await repository.approve({
      ...approvalInput(),
      approvalKind: 'live',
      separationOverride: true,
      reason: 'Application owner authorizes a break-glass single-owner launch'
    })

    expect(result).toMatchObject({
      status: 'approved',
      approval: { approvalKind: 'live', separationOverride: true }
    })
    expect(statements.find(statement => /INSERT INTO measurement_activation_approvals/.test(statement.sql))?.params)
      .toContain(true)
  })

  it('activates only when distinct current-version approvals and all readiness evidence pass', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [profileRow()] }
        }
        if (/FROM measurement_activation_approvals/.test(sql)) {
          return { rows: [
            { approval_kind: 'privacy', approved_by: PRIVACY_APPROVER_ID, created_at: CREATED_AT },
            { approval_kind: 'live', approved_by: LIVE_APPROVER_ID, created_at: CREATED_AT }
          ] }
        }
        if (/AS destinations/.test(sql)) {
          return { rows: [{
            destinations: '1',
            ready_destinations: '1',
            capabilities: '1',
            ready_capabilities: '1',
            active_mappings: '1',
            outcome_endpoints: '1',
            ready_outcome_endpoints: '1'
          }] }
        }
        if (/UPDATE client_measurement_profiles/.test(sql)) {
          return { rows: [profileRow(4, true, 'live')] }
        }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    const result = await repository.activate(activationInput())

    expect(result).toMatchObject({
      status: 'activated',
      profile: { enabled: true, environment: 'live', configVersion: 4 },
      activatedDestinations: 1
    })
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/client_measurement_profiles[\s\S]*FOR UPDATE/),
      expect.stringMatching(/FROM measurement_activation_approvals/),
      expect.stringMatching(/AS destinations/),
      expect.stringMatching(/UPDATE client_measurement_profiles/),
      expect.stringMatching(/UPDATE conversion_destinations/),
      expect.stringMatching(/UPDATE conversion_destination_capabilities/),
      expect.stringMatching(/UPDATE conversion_event_mappings/),
      expect.stringMatching(/INSERT INTO measurement_config_audit/)
    ])
  })

  it('returns blockers without mutating when provider readiness is incomplete', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/client_measurement_profiles/.test(sql)) {
          return { rows: [{ ...profileRow(), outcome_authority: 'client_webhook' }] }
        }
        if (/measurement_activation_approvals/.test(sql)) {
          return { rows: [
            { approval_kind: 'privacy', approved_by: PRIVACY_APPROVER_ID, created_at: CREATED_AT },
            { approval_kind: 'live', approved_by: LIVE_APPROVER_ID, created_at: CREATED_AT }
          ] }
        }
        return { rows: [{
          destinations: '1',
          ready_destinations: '0',
          capabilities: '1',
          ready_capabilities: '0',
          active_mappings: '1',
          outcome_endpoints: '0',
          ready_outcome_endpoints: '0'
        }] }
      })
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.activate(activationInput())).resolves.toEqual({
      status: 'not_ready',
      blockers: [
        'destination_not_ready',
        'capability_not_ready',
        'outcome_endpoint_not_ready'
      ]
    })
    expect(db.query).toHaveBeenCalledTimes(3)
  })

  it('allows activation when the owner live approval explicitly overrides separation', async () => {
    const statements: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql)
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) return { rows: [profileRow()] }
        if (/FROM measurement_activation_approvals/.test(sql)) {
          return { rows: [
            {
              approval_kind: 'privacy',
              approved_by: PRIVACY_APPROVER_ID,
              separation_override: false,
              created_at: CREATED_AT
            },
            {
              approval_kind: 'live',
              approved_by: PRIVACY_APPROVER_ID,
              separation_override: true,
              created_at: CREATED_AT
            }
          ] }
        }
        if (/AS destinations/.test(sql)) {
          return { rows: [{
            destinations: '1',
            ready_destinations: '1',
            capabilities: '1',
            ready_capabilities: '1',
            active_mappings: '1',
            outcome_endpoints: '0',
            ready_outcome_endpoints: '0'
          }] }
        }
        if (/UPDATE client_measurement_profiles/.test(sql)) {
          return { rows: [profileRow(4, true, 'live')] }
        }
        return { rows: [] }
      })
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.activate(activationInput())).resolves.toMatchObject({
      status: 'activated',
      activatedDestinations: 1
    })
    const approvalSql = statements.find(sql => /FROM measurement_activation_approvals/.test(sql))!
    expect(approvalSql).toMatch(/FROM team_members/)
    expect(approvalSql).toMatch(/user_role = 'owner'/)
    expect(approvalSql).toMatch(/is_active = TRUE/)
  })

  it('blocks activation when the owner override authorization is no longer current', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) return { rows: [profileRow()] }
        if (/FROM measurement_activation_approvals/.test(sql)) {
          return { rows: [
            {
              approval_kind: 'privacy',
              approved_by: PRIVACY_APPROVER_ID,
              separation_override: false,
              created_at: CREATED_AT
            },
            {
              approval_kind: 'live',
              approved_by: PRIVACY_APPROVER_ID,
              separation_override: false,
              created_at: CREATED_AT
            }
          ] }
        }
        return { rows: [{
          destinations: '1',
          ready_destinations: '1',
          capabilities: '1',
          ready_capabilities: '1',
          active_mappings: '1',
          outcome_endpoints: '0',
          ready_outcome_endpoints: '0'
        }] }
      })
    }
    const repository = createPostgresMeasurementActivationRepository({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => (
        callback(db)
      )) as never
    })

    await expect(repository.activate(activationInput())).resolves.toEqual({
      status: 'not_ready',
      blockers: ['approver_conflict']
    })
  })
})
