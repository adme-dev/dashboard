import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/225_hr_source_provenance_hardening.sql', import.meta.url),
  'utf8',
)

describe('HR source provenance migration', () => {
  it('requires non-empty source references for role KPIs and department goals', () => {
    expect(migration).toContain('hr_role_kpi_definitions_source_ref_present')
    expect(migration).toContain('hr_department_goal_versions_source_ref_present')
    expect(migration.match(/ALTER COLUMN source_ref SET NOT NULL/g)).toHaveLength(2)
    expect(migration.match(/length\(trim\(source_ref\)\) > 0/g)).toHaveLength(2)
  })
})
