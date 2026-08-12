import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/366_google_pmax_launch_tasks.sql', import.meta.url),
  'utf8'
)

describe('Google PMax generated launch tasks migration 366', () => {
  it('creates a stable launch-to-task ledger', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS campaign_launch_tasks')
    expect(migration).toContain('UNIQUE (launch_id, task_key)')
    expect(migration).toMatch(/REFERENCES campaign_launches \(id, config_version, config_hash\) ON DELETE CASCADE/)
    expect(migration).toContain('REFERENCES tasks(id) ON DELETE SET NULL')
  })

  it('tracks current, cleared, and superseded blocker lifecycle', () => {
    expect(migration).toContain('status IN (\'open\', \'cleared\', \'superseded\')')
    expect(migration).toContain('severity IN (\'blocker\', \'advisory\')')
    expect(migration).toContain('execution IN (\'automatable\', \'assisted\', \'human\')')
  })

  it('is transactional and idempotent', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toContain('IF NOT EXISTS')
  })
})
