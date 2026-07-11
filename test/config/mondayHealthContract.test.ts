import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/api/agency/monday/health.get.ts', 'utf8')
describe('Monday operational health contract', () => {
  it('restricts access and bounds the inactivity threshold', () => {
    expect(source).toContain("requireRole(event, ['admin', 'owner'])")
    expect(source).toContain('Math.min(Math.max')
    expect(source).toContain('INTERVAL \'1 day\'')
  })
  it('reports overdue, blocked, and inactive mapped tasks', () => {
    expect(source).toContain('monday_item_mappings')
    expect(source).toContain('last_updated_at')
    expect(source).toContain("'overdue'")
    expect(source).toContain("'blocked'")
    expect(source).toContain("'inactive'")
  })
})
