import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/262_department_manager_contract.sql', import.meta.url),
  'utf8'
)

describe('Department manager contract migration 262', () => {
  it('restores the manager column required by the board APIs', () => {
    expect(migration).toMatch(
      /ALTER TABLE departments[\s\S]*ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES team_members\(id\) ON DELETE SET NULL/
    )
    expect(migration).toContain('idx_departments_manager')
  })
})
