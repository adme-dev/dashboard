import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/312_persona_exclusion_audiences.sql',
  import.meta.url
)

describe('Persona exclusion audiences migration 312', () => {
  it('adds is_exclusion, an exclusion-membership table, and seeds the negative-signal exclusion definition', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toMatch(/ALTER TABLE crm_persona_definitions\s+ADD COLUMN IF NOT EXISTS is_exclusion BOOLEAN NOT NULL DEFAULT FALSE;/)
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS crm_persona_exclusion_memberships')
    expect(migration).toContain('PRIMARY KEY (client_id, profile_id)')
    expect(migration).toContain('crm_persona_exclusion_memberships_profile_fk')
    expect(migration).toContain("'automotive', 'negative_signal_exclusion'")
    expect(migration).toContain('"competitive_referrer","exit_intent"')
    expect(migration).toContain('WHERE NOT EXISTS (')
    expect(migration).toContain('COMMIT;')
  })
})
