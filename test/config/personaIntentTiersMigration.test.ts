import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/311_persona_intent_tiers.sql',
  import.meta.url
)

describe('Persona intent tiers migration 311', () => {
  it('adds tier_rank, a tier-membership table, and seeds 3 ranked tier definitions', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toMatch(/ALTER TABLE crm_persona_definitions\s+ADD COLUMN tier_rank INTEGER NULL;/)
    expect(migration).toContain('CREATE TABLE crm_persona_tier_memberships')
    expect(migration).toMatch(/tier_key TEXT NOT NULL CHECK \(tier_key IN \('hot', 'warm', 'cold'\)\)/)
    expect(migration).toContain('PRIMARY KEY (client_id, profile_id)')
    expect(migration).toContain('crm_persona_tier_memberships_profile_fk')
    expect(migration).toContain('idx_crm_persona_tier_memberships_tier')
    expect(migration).toContain("'automotive', 'hot'")
    expect(migration).toContain("'automotive', 'warm'")
    expect(migration).toContain("'automotive', 'cold'")
    expect(migration).toContain('COMMIT;')
  })
})
