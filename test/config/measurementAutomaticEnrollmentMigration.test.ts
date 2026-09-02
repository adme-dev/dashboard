import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/411_measurement_automatic_enrollment.sql', import.meta.url),
  'utf8'
)

describe('measurement automatic enrollment migration', () => {
  it('provisions a desired-on measurement profile for every newly inserted client', () => {
    expect(migration).toMatch(/AFTER INSERT ON agency_clients/)
    expect(migration).toMatch(/INSERT INTO client_measurement_profiles/)
    expect(migration).toMatch(/NEW\.id/)
    expect(migration).toMatch(/TRUE,\s*'new_client_default'/)
  })

  it('backfills missing profiles without changing existing profiles or opt-outs', () => {
    expect(migration).toMatch(/SELECT[\s\S]*client\.id[\s\S]*TRUE,[\s\S]*'new_client_default'/)
    expect(migration).toMatch(/ON CONFLICT \(client_id\) DO NOTHING/)
    expect(migration).not.toMatch(/UPDATE client_measurement_profiles/)
  })

  it('keeps provider delivery fail-closed until destinations are configured', () => {
    expect(migration).not.toMatch(/enabled\s*=\s*TRUE/i)
    expect(migration).not.toMatch(/environment\s*=\s*'live'/i)
    expect(migration).not.toMatch(/INSERT INTO conversion_destinations/i)
  })
})
