import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../server/database/migrations/224_hr_review_follow_ups.sql', import.meta.url), 'utf8')

describe('HR follow-up migration', () => {
  it('distinguishes learning from structural and role-governance actions', () => {
    expect(migration).toContain("'learning'")
    expect(migration).toContain("'process_change'")
    expect(migration).toContain("'workload_adjustment'")
    expect(migration).toContain("'role_clarification'")
  })

  it('requires an owner and due date and preserves an event history', () => {
    expect(migration).toContain('owner_id UUID NOT NULL')
    expect(migration).toContain('due_at TIMESTAMPTZ NOT NULL')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_follow_up_events')
  })
})
