import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/337_mcp_spend_connection_mapping.sql',
  import.meta.url
)

describe('MCP spend connection mapping migration 337', () => {
  it('backfills campaign spend from the explicit connection-to-client mapping', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toMatch(/UPDATE media_spend AS ms/i)
    expect(migration).toMatch(/FROM social_connections AS sc/i)
    expect(migration).toMatch(/ms\.connection_id = sc\.id/i)
    expect(migration).toMatch(/ms\.client_id IS NULL/i)
    expect(migration).toMatch(/sc\.client_id IS NOT NULL/i)
    expect(migration).toContain('COMMIT;')
  })
})
