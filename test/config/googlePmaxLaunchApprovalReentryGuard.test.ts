import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/351_google_pmax_launch_foundation.sql', import.meta.url)

describe('Google PMax launch approval re-entry guard migration', () => {
  it('requires each approval state transition to use its exact source state', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('NEW.state = \'APPROVED\' AND OLD.state <> \'READY_FOR_APPROVAL\'')
    expect(sql).toContain('NEW.state = \'ACTIVATION_APPROVED\' AND OLD.state <> \'VERIFIED_PAUSED\'')
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF state ON campaign_launches')
  })
})
