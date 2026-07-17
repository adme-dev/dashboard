import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/258_measurement_provider_test_runs.sql',
  import.meta.url
)

describe('Measurement provider test-run migration 258', () => {
  it('creates append-only, tenant-scoped and redacted pilot evidence', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS measurement_provider_test_runs')
    expect(migration).toMatch(/FOREIGN KEY \(client_id, profile_id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(client_id, destination_id\)/)
    expect(migration).toContain("mode IN ('meta_test_events', 'google_validate_only')")
    expect(migration).toContain("status IN ('requested', 'accepted', 'failed')")
    expect(migration).toContain('idempotency_key TEXT NOT NULL')
    expect(migration).toContain('UNIQUE (client_id, idempotency_key)')
    expect(migration).toContain('trg_measurement_provider_test_runs_append_only')
    expect(migration).not.toMatch(/^\s*(test_event_code|gclid|gbraid|wbraid|access_token|refresh_token)\s+/im)
  })
})
