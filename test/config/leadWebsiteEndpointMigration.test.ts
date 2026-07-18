import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'server/database/migrations/265_first_party_lead_webhook_endpoints.sql',
  'utf8'
)

describe('first-party lead webhook endpoint migration', () => {
  it('adds a dedicated webhook source without changing Google endpoint identity', () => {
    expect(migration).toContain("source IN ('google', 'meta_app', 'webhook')")
    expect(migration).toMatch(/UNIQUE INDEX[\s\S]*client_id, source[\s\S]*source = 'webhook'/i)
    expect(migration).not.toMatch(/UPDATE lead_webhook_endpoints/)
  })
})
