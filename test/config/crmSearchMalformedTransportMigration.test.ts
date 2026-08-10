import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/353_crm_search_malformed_transport_dead_letters.sql',
  import.meta.url
)

describe('CRM search malformed transport migration 353', () => {
  it('stores only bounded message identity evidence with runtime ACLs and retention guard', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql.trimStart()).toMatch(/^BEGIN;/)
    expect(sql.trimEnd()).toMatch(/COMMIT;$/)
    expect(sql).toContain('SET LOCAL lock_timeout = \'5s\'')
    expect(sql).toContain('SET LOCAL statement_timeout = \'60s\'')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS crm_search_malformed_transport_dead_letters/i)
    expect(sql).toMatch(/queue_message_id_digest[\s\S]*\^sha256:\[a-f0-9\]\{64\}\$/i)
    expect(sql).toMatch(/protocol_version[\s\S]*= 1/i)
    expect(sql).toMatch(/queue_name[\s\S]*= 'dead_letter'/i)
    expect(sql).toMatch(/attempts[\s\S]*BETWEEN 1 AND 1000/i)
    expect(sql).toMatch(/crm_search_retention_delete_guard/i)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE[\s\S]*TO crm_search_runtime/i)
    expect(sql).not.toMatch(/raw_body|request_body|payload|source_text|provider_response/i)
  })
})
