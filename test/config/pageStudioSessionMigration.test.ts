import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/403_page_studio_sessions.sql',
  import.meta.url
)

describe('Page Studio session migration', () => {
  it('stores only scoped session claims and revocation state without persisting bearer tokens', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS page_studio_sessions\b/i)
    expect(sql).toMatch(/nonce\s+TEXT\s+PRIMARY KEY/i)
    expect(sql).toMatch(/capabilities\s+JSONB\s+NOT NULL/i)
    expect(sql).toMatch(/revoked_at\s+TIMESTAMPTZ/i)
    expect(sql).toMatch(/FOREIGN KEY\s*\(tenant_id,\s*client_id,\s*site_id\)/i)
    expect(sql).toMatch(/expires_at\s*<=\s*issued_at\s*\+\s*INTERVAL\s*'15 minutes'/i)
    expect(sql).not.toMatch(/token\s+TEXT/i)
    expect(sql).not.toMatch(/private_key/i)
  })
})
