import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('persona audience provider activation migration', () => {
  const sql = readFileSync(resolve(
    __dirname,
    '../../server/database/migrations/296_persona_audience_provider_activation.sql'
  ), 'utf8')

  it('creates provider settings, reconciliation state and append-only audit', () => {
    expect(sql).toMatch(/crm_persona_audience_provider_settings/)
    expect(sql).toMatch(/crm_persona_audience_exports/)
    expect(sql).toMatch(/crm_persona_audience_export_members/)
    expect(sql).toMatch(/crm_persona_audience_member_state/)
    expect(sql).toMatch(/crm_persona_audience_provider_audit/)
    expect(sql).toMatch(/prevent_measurement_append_only_mutation/)
  })

  it('retains only hashed identifiers for provider removal propagation', () => {
    expect(sql).toMatch(/email_hash CHAR\(64\)/)
    expect(sql).toMatch(/phone_hash CHAR\(64\)/)
    expect(sql).not.toMatch(/\bemail TEXT\b/)
    expect(sql).not.toMatch(/\bphone TEXT\b/)
  })
})
