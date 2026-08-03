import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Search Authority publication measurement migration', () => {
  it('records whether an immutable publication was rendered with first-party measurement', () => {
    const sql = readFileSync('server/database/migrations/339_search_authority_publication_measurement.sql', 'utf8')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS measurement_enabled BOOLEAN NOT NULL DEFAULT FALSE')
  })
})
