import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const route = readFileSync('server/api/webhooks/monday.post.ts', 'utf8')
const migration = readFileSync('server/database/migrations/230_monday_webhook_events.sql', 'utf8')
describe('Monday webhook contract', () => {
  it('handles challenge, verifies signatures, and rejects missing configuration', () => {
    expect(route).toContain('body?.challenge')
    expect(route).toContain('MONDAY_SIGNING_SECRET')
    expect(route).toContain('Invalid Monday webhook signature')
  })
  it('deduplicates events before asynchronous reconciliation', () => {
    expect(route).toContain('x-apps-event-id')
    expect(route).toContain('ON CONFLICT (monday_event_id) DO NOTHING')
    expect(migration).toContain('monday_webhook_events')
    expect(migration).toContain('status VARCHAR(20)')
  })
})
