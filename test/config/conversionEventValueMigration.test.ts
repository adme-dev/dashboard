import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/310_conversion_event_value.sql',
  import.meta.url
)

describe('Conversion event value migration 310', () => {
  it('adds nullable value/currency columns paired by a CHECK constraint', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('ALTER TABLE conversion_events')
    expect(migration).toMatch(/ADD COLUMN value NUMERIC\(14,2\) NULL/)
    expect(migration).toMatch(/ADD COLUMN currency_code TEXT NULL/)
    expect(migration).toContain('conversion_events_value_currency_pair')
    expect(migration).toMatch(/CHECK \(\(value IS NULL\) = \(currency_code IS NULL\)\)\s+NOT VALID;/)
    expect(migration).toContain('VALIDATE CONSTRAINT conversion_events_value_currency_pair')
    expect(migration).toContain('COMMIT;')
  })
})
