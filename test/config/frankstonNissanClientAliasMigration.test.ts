import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/401_frankston_nissan_client_alias.sql', import.meta.url),
  'utf8',
)

describe('Frankston Nissan client alias migration', () => {
  it('maps the alias to the existing Frankston Motor Group identity idempotently', () => {
    expect(migration).toContain("'8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid")
    expect(migration).toContain("'Frankston Motor Group'")
    expect(migration).toContain("'Frankston Nissan'")
    expect(migration).toMatch(/INSERT INTO agency_client_aliases/)
    expect(migration).toMatch(/ON CONFLICT \(LOWER\(alias\)\) DO UPDATE/)
    expect(migration).not.toMatch(/INSERT INTO agency_clients/)
  })

  it('fails instead of silently creating a mapping when the canonical client is absent', () => {
    expect(migration).toMatch(/IF NOT EXISTS[\s\S]*RAISE EXCEPTION/)
  })
})
