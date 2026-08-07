import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/351_google_pmax_launch_foundation.sql', import.meta.url)

describe('Google PMax launch database state graph guard', () => {
  it('matches the application graph and binds retries to their recorded phase', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('OLD.state = \'READY_FOR_APPROVAL\' AND NEW.state IN (\'DRAFT\', \'PREFLIGHT_FAILED\', \'APPROVED\', \'CANCELLED\')')
    expect(sql).toContain('OLD.state = \'VERIFIED_PAUSED\' AND NEW.state = \'ACTIVATION_APPROVED\'')
    expect(sql).toContain('OLD.state = \'FAILED_RETRYABLE\' AND NEW.state IN (\'EXECUTING\', \'ENABLING\', \'RECOVERY_REQUIRED\')')
    expect(sql).toContain('OLD.retry_from_state IS DISTINCT FROM NEW.state')
    expect(sql).toContain('BEFORE UPDATE OF state, retry_from_state ON campaign_launches')
  })

  it('does not permit staging backward from executing or enabling to reuse approval', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).not.toContain('OLD.state = \'EXECUTING\' AND NEW.state IN (\'READY_FOR_APPROVAL\'')
    expect(sql).not.toContain('OLD.state = \'ENABLING\' AND NEW.state IN (\'VERIFIED_PAUSED\'')
  })
})
