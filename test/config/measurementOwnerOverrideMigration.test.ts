import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../server/database/migrations/266_measurement_owner_override.sql',
    import.meta.url
  ),
  'utf8'
)

describe('Measurement owner override migration 266', () => {
  it('adds a durable override marker without weakening the ordinary approval path', () => {
    expect(migration).toContain('separation_override BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migration).toMatch(/DROP CONSTRAINT %I/)
    expect(migration).toContain('enforce_measurement_approval_separation')
    expect(migration).toMatch(/NEW\.approval_kind <> 'live'/)
    expect(migration).toMatch(/NEW\.separation_override IS NOT TRUE/)
    expect(migration).toMatch(/user_role = 'owner'/)
    expect(migration).toMatch(/is_active = TRUE/)
  })
})
