import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/351_google_pmax_launch_foundation.sql', import.meta.url)

describe('Google PMax launch retry phase database guard', () => {
  it('binds entry, storage and exit to the phase that failed', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('NEW.state = \'FAILED_RETRYABLE\'')
    expect(sql).toContain('NEW.retry_from_state IS DISTINCT FROM OLD.state')
    expect(sql).toContain('OLD.state = \'FAILED_RETRYABLE\'')
    expect(sql).toContain('OLD.retry_from_state IS DISTINCT FROM NEW.retry_from_state')
    expect(sql).toContain('OLD.retry_from_state IS DISTINCT FROM NEW.state')
    expect(sql).toContain('BEFORE UPDATE OF state, retry_from_state ON campaign_launches')
  })
})
