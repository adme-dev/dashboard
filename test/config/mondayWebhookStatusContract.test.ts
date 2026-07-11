import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/api/agency/monday/webhook-status.get.ts', 'utf8')
describe('Monday webhook status contract', () => {
  it('is restricted to operational administrators', () => {
    expect(source).toContain("requireRole(event, ['admin', 'owner'])")
  })
  it('reports queue counts and recent failures', () => {
    expect(source).toContain('monday_webhook_events')
    expect(source).toContain('recentFailures')
    expect(source).toContain("status = 'failed'")
  })
})
