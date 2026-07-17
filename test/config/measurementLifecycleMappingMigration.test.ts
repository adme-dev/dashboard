import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/260_measurement_lifecycle_mappings.sql', import.meta.url),
  'utf8'
)

describe('Measurement lifecycle mapping migration 260', () => {
  it('creates tenant and profile scoped lifecycle mappings with one active source mapping', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS measurement_lifecycle_mappings')
    expect(migration).toContain('FOREIGN KEY (client_id, profile_id)')
    expect(migration).toContain('REFERENCES client_measurement_profiles(client_id, id)')
    expect(migration).toContain('idx_measurement_lifecycle_mappings_one_active')
    expect(migration).toMatch(/WHERE is_active = TRUE/)
  })

  it('restricts sources and outcomes to supported canonical values', () => {
    expect(migration).toContain("source_type IN ('lead_status', 'crm_stage')")
    for (const event of [
      'lead_created',
      'lead_contacted',
      'lead_qualified',
      'lead_won',
      'lead_lost'
    ]) {
      expect(migration).toContain(`'${event}'`)
    }
    expect(migration).toMatch(/source_type = 'lead_status'[\s\S]*source_value IN/)
  })

  it('extends the append-only audit vocabulary for lifecycle mapping changes', () => {
    expect(migration).toContain("'lifecycle_mapping'")
    expect(migration).toContain('measurement_config_audit_entity_type_check')
  })
})
