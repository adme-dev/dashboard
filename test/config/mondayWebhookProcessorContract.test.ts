import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/api/cron/monday-webhooks.post.ts', 'utf8')
describe('Monday webhook processor contract', () => {
  it('requires cron authentication and bounded processing', () => {
    expect(source).toContain('CRON_SECRET')
    expect(source).toContain('LIMIT 100')
    expect(source).toContain("status = 'queued'")
  })
  it('updates mapped tasks and records processed/failed outcomes', () => {
    expect(source).toContain('monday_item_mappings')
    expect(source).toContain("status = 'processed'")
    expect(source).toContain("status = 'failed'")
  })
})
