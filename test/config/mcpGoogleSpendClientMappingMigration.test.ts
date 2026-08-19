import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('MCP Google spend client mapping migration', () => {
  it('maps verified account ids at the connection and current spend layers without name guessing', () => {
    const sql = readFileSync('server/database/migrations/388_mcp_google_spend_client_mappings.sql', 'utf8')
    expect(sql).toMatch(/UPDATE social_connections/i)
    expect(sql).toMatch(/UPDATE media_spend/i)
    expect(sql).toContain('3990667550')
    expect(sql).toContain('6801934411')
    expect(sql).toContain('8234727398')
    expect(sql).toContain('9186592325')
    expect(sql).not.toMatch(/\('8140847721'/)
    expect(sql).not.toMatch(/ILIKE/i)
  })
})
