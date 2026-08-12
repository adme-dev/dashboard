import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/362_google_pmax_launch_foundation.sql', import.meta.url)

describe('Google PMax launch insert approval guard migration', () => {
  it('closes direct-insert and non-atomic approval bypasses', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('TG_OP = \'INSERT\'')
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF state ON campaign_launches')
    expect(sql).toContain('validate_campaign_launch_approval_source_state')
    expect(sql).toContain('validate_campaign_launch_approval_final_state')
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(sql).toContain('approval and state transition must commit atomically')
    expect(sql).toContain('OLD.state <> \'READY_FOR_APPROVAL\'')
    expect(sql).toContain('OLD.state <> \'VERIFIED_PAUSED\'')
  })
})
