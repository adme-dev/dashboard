import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/289-crm-email-lead-source.sql',
  import.meta.url
)

describe('CRM email lead source migration 289', () => {
  it('adds email to the existing lead and form-rule source allowlists', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain(
      'CHECK (source IN (\'meta\', \'google\', \'manual\', \'webhook\', \'csv\', \'email\'))'
    )
    expect(sql).toContain(
      'CHECK (source IN (\'meta\', \'google\', \'webhook\', \'csv\', \'email\'))'
    )
  })

  it('replaces only the two named source constraints in one transaction', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
    expect(sql).toContain(
      'ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check'
    )
    expect(sql).toMatch(
      /ALTER TABLE lead_form_rules\s+DROP CONSTRAINT IF EXISTS lead_form_rules_source_check/
    )
    expect(sql).not.toMatch(/\b(?:DELETE FROM|TRUNCATE|DROP TABLE)\b/i)
  })
})
