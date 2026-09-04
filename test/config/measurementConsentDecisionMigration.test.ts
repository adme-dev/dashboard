import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/341_measurement_consent_lineage.sql', import.meta.url),
  'utf8'
)

describe('measurement consent lineage migration', () => {
  it('adds a constrained canonical consent decision with a safe legacy default', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS consent_decision TEXT NOT NULL DEFAULT 'unknown'/)
    expect(migration).toContain('conversion_events_consent_decision_check')
    expect(migration).toMatch(/consent_decision IN \('granted', 'denied', 'unknown'\)/)
  })
})
