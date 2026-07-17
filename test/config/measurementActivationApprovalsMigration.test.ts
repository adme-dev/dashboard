import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../server/database/migrations/259_measurement_activation_approvals.sql',
    import.meta.url
  ),
  'utf8'
)

describe('Measurement activation approvals migration 259', () => {
  it('creates an immutable tenant-scoped approval ledger bound to a config version', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS measurement_activation_approvals')
    expect(migration).toMatch(/FOREIGN KEY \(client_id, profile_id\)/)
    expect(migration).toMatch(/REFERENCES client_measurement_profiles\(client_id, id\)/)
    expect(migration).toContain('approval_kind IN (\'privacy\', \'live\')')
    expect(migration).toContain('UNIQUE (client_id, profile_id, config_version, approval_kind)')
    expect(migration).toContain('UNIQUE (client_id, profile_id, config_version, approved_by)')
    expect(migration).toContain('trg_measurement_activation_approvals_append_only')
    expect(migration).toContain('prevent_measurement_append_only_mutation')
  })

  it('extends canonical audit actions for approval and activation', () => {
    expect(migration).toContain('measurement_config_audit_action_check')
    expect(migration).toContain('\'approved\'')
    expect(migration).toContain('\'activated\'')
  })
})
