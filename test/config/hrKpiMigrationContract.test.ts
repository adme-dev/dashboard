import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../server/database/migrations/222_hr_role_kpis.sql', import.meta.url), 'utf8')

describe('HR KPI migration', () => {
  it('locks KPI definitions to role versions and observations to review participants', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_role_kpi_definitions')
    expect(migration).toContain('role_profile_version_id UUID NOT NULL')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_kpi_observations')
    expect(migration).toContain('participant_id UUID NOT NULL')
  })

  it('preserves targets, provenance, verification and employee challenge state', () => {
    expect(migration).toContain('target_snapshot JSONB NOT NULL')
    expect(migration).toContain('source_ref TEXT NOT NULL')
    expect(migration).toContain("'disputed'")
    expect(migration).toContain('verified_by UUID')
  })
})
