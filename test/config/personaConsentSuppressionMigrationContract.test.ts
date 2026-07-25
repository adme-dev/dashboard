import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('persona consent and suppression control plane migration', () => {
  const sql = readFileSync(resolve(
    __dirname,
    '../../server/database/migrations/298_persona_consent_suppression_control_plane.sql'
  ), 'utf8')

  it('adds purpose evidence and append-only suppression history', () => {
    expect(sql).toMatch(/policy_version/)
    expect(sql).toMatch(/notice_url/)
    expect(sql).toMatch(/decision_method/)
    expect(sql).toMatch(/crm_persona_suppression_events/)
    expect(sql).toMatch(/prevent_measurement_append_only_mutation/)
  })

  it('requires current consent and suppression clearance for sync members', () => {
    expect(sql).toMatch(/crm_persona_marketing_eligible/)
    expect(sql).toMatch(/trg_persona_export_member_consent/)
    expect(sql).toMatch(/export_operation <> 'sync'/)
    expect(sql).toMatch(/Removal must remain possible/)
  })
})
