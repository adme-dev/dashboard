import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('identity resolution governance migration', () => {
  const sql = readFileSync(resolve(
    __dirname,
    '../../server/database/migrations/299_identity_resolution_governance.sql'
  ), 'utf8')

  it('creates tenant-scoped cases, immutable versions, members and audit evidence', () => {
    expect(sql).toMatch(/crm_identity_resolution_cases/)
    expect(sql).toMatch(/crm_identity_resolution_versions/)
    expect(sql).toMatch(/crm_identity_resolution_members/)
    expect(sql).toMatch(/crm_identity_resolution_audit/)
    expect(sql).toMatch(/prevent_measurement_append_only_mutation/)
  })

  it('provides a current projection without rewriting raw identity evidence', () => {
    expect(sql).toMatch(/crm_identity_current_resolution/)
    expect(sql).toMatch(/ROW_NUMBER\(\) OVER/)
    expect(sql).toMatch(/operation IN \('merge', 'split', 'rollback'\)/)
  })
})
