import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/261_measurement_delivery_diagnostics.sql', import.meta.url),
  'utf8'
)

describe('measurement delivery diagnostics migration', () => {
  it('adds leased diagnostics cadence to canonical deliveries', () => {
    expect(migration).toContain('diagnostic_status')
    expect(migration).toContain('diagnostic_next_check_at')
    expect(migration).toContain('diagnostic_claimed_at')
    expect(migration).toContain('diagnostic_check_count')
    expect(migration).toMatch(/WHERE diagnostic_status IN \('pending', 'processing'\)/)
  })

  it('stores append-only redacted diagnostic checks with tenant-safe foreign keys', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS conversion_delivery_diagnostic_checks')
    expect(migration).toContain('UNIQUE (delivery_id, check_number)')
    expect(migration).toContain('REFERENCES conversion_deliveries(client_id, id)')
    expect(migration).toContain('trg_conversion_delivery_diagnostic_checks_append_only')
    expect(migration).not.toMatch(/raw_(payload|response)|response_body/i)
  })
})
