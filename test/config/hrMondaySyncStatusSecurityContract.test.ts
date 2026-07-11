import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/api/agency/hr/monday/sync-status.get.ts', 'utf8')

describe('HR Monday sync status security contract', () => {
  it('is owner-only and fails closed without an active approved scope', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain('getActiveMondayEvidenceScope()')
    expect(source).toContain('active: false')
  })
})
