import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('server/database/migrations/271_send_private_internal.sql', 'utf8')

describe('private internal Send migration', () => {
  it('allows ready workspace transfers without weakening public token requirements', () => {
    expect(sql).toContain('sender_class = \'workspace\'')
    expect(sql).toContain('sender_class = \'public\'')
    expect(sql).toContain('share_token_hash IS NOT NULL')
    expect(sql).toContain('status <> \'ready\'')
  })

  it('records the internal validation policy without claiming a malware scan', () => {
    expect(sql).toContain('scan_status = \'not_required\'')
    expect(sql).toContain('\'private_internal_v1\'')
    expect(sql).not.toContain('DISABLE TRIGGER')
  })

  it('is additive and transaction wrapped', () => {
    expect(sql.trimStart()).toMatch(/^BEGIN;/)
    expect(sql.trimEnd()).toMatch(/COMMIT;$/)
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN/i)
  })
})
