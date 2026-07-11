import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/api/agency/hr/monday/readiness.get.ts', 'utf8')
describe('HR Monday readiness contract', () => {
  it('is owner-only and reports all production gates', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain('mondayConnection')
    expect(source).toContain('approvedScope')
    expect(source).toContain('syncSchema')
    expect(source).toContain('knowledgeSchema')
    expect(source).toContain('Object.values(gates).every(Boolean)')
  })
})
