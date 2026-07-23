import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Podium webhook endpoint migration', () => {
  const sql = readFileSync(resolve(
    __dirname,
    '../../server/database/migrations/275_podium_lead_webhook_endpoints.sql'
  ), 'utf8')

  it('adds an isolated Podium endpoint source and one credential per client', () => {
    expect(sql).toMatch(/source IN \([^)]*'podium'/s)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_webhook_endpoints_client_podium/)
    expect(sql).toMatch(/WHERE source = 'podium'/)
  })
})
