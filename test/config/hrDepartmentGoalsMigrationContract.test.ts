import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../server/database/migrations/223_hr_department_goals.sql', import.meta.url), 'utf8')

describe('HR department goal migration', () => {
  it('versions department goals and links role KPIs explicitly', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_department_goals')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_department_goal_versions')
    expect(migration).toContain('UNIQUE (goal_id, version)')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_role_kpi_goal_links')
  })

  it('requires a contribution weight, rationale slot, period and source provenance', () => {
    expect(migration).toContain('contribution_weight')
    expect(migration).toContain('rationale TEXT')
    expect(migration).toContain('period_start DATE NOT NULL')
    expect(migration).toContain('source_ref TEXT')
  })
})
